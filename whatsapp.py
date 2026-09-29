'''
WhatsApp channel via Twilio — webhook verification, sender matching and outbound replies.

Required environment variables:
  TWILIO_ACCOUNT_SID     Twilio account SID
  TWILIO_AUTH_TOKEN      Twilio auth token (also used to verify webhook signatures)
  TWILIO_WHATSAPP_FROM   WhatsApp sender, e.g. "whatsapp:+14155238886"
Optional:
  WHATSAPP_WEBHOOK_URL   Public URL configured in Twilio, e.g. "https://asksharia.info/api/whatsapp/webhook".
                         Needed behind a reverse proxy, where the URL the app sees differs from the
                         one Twilio signed.
'''

import logging
import os
import re
from collections import OrderedDict
from typing import List, Optional

from twilio.request_validator import RequestValidator
from twilio.rest import Client

logger = logging.getLogger(__name__)

# Twilio rejects WhatsApp message bodies longer than this
MAX_MESSAGE_CHARS = 1600
# Fallback match length — enough to identify a national mobile number without its country code
_SUFFIX_DIGITS = 9
# Twilio can re-send a webhook (e.g. after a timeout); remember recent MessageSids so each
# message is answered (and charged) once
_SEEN_LIMIT = 1000
_seen_message_sids: "OrderedDict[str, None]" = OrderedDict()

EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'

MSG_NOT_REGISTERED = (
    "هذا الرقم غير مسجَّل. يرجى التسجيل في https://asksharia.info باستخدام رقم الواتساب هذا.\n\n"
    "This number is not registered. Please sign up at https://asksharia.info using this WhatsApp number."
)
MSG_DISABLED = "تم تعطيل حسابك.\n\nYour account is disabled."
MSG_NO_TOKENS = (
    "لم يتبقَّ لديك رصيد. تواصل مع المسؤول لإعادة الشحن.\n\n"
    "No tokens remaining. Contact your owner to top up."
)
MSG_TEXT_ONLY = "يرجى إرسال سؤالك كرسالة نصية.\n\nPlease send your question as a text message."
MSG_ERROR = (
    "حدث خطأ أثناء معالجة سؤالك. يرجى المحاولة مرة أخرى.\n\n"
    "Something went wrong answering your question. Please try again."
)

_client: Optional[Client] = None


def is_configured() -> bool:
    return all(os.getenv(k) for k in ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_WHATSAPP_FROM"))


def is_valid_request(url: str, form: dict, signature: str) -> bool:
    """Check the X-Twilio-Signature header so only Twilio can post to the webhook."""
    validator = RequestValidator(os.environ["TWILIO_AUTH_TOKEN"])
    return validator.validate(os.getenv("WHATSAPP_WEBHOOK_URL") or url, form, signature or "")


def is_new_message(message_sid: str) -> bool:
    """False if this MessageSid was already handled (a redelivered webhook)."""
    if not message_sid:
        return True
    if message_sid in _seen_message_sids:
        return False
    _seen_message_sids[message_sid] = None
    if len(_seen_message_sids) > _SEEN_LIMIT:
        _seen_message_sids.popitem(last=False)
    return True


def _digits(value: str) -> str:
    return re.sub(r"\D", "", value or "")


def match_user(users: list, sender: str):
    """Return the user whose mobile matches the WhatsApp sender ("whatsapp:+9665..."), or None.

    Registration stores the mobile as "<country code><typed number>", so it may contain spaces or a
    trunk "0" after the country code. An exact digit match wins; otherwise fall back to the last
    _SUFFIX_DIGITS digits, but only when exactly one user matches.
    """
    sender_digits = _digits(sender)
    if not sender_digits:
        return None
    exact = [u for u in users if _digits(u.mobile) == sender_digits]
    if exact:
        return exact[0]
    suffix = sender_digits[-_SUFFIX_DIGITS:]
    partial = [u for u in users if len(_digits(u.mobile)) >= _SUFFIX_DIGITS and _digits(u.mobile).endswith(suffix)]
    if len(partial) == 1:
        return partial[0]
    if len(partial) > 1:
        logger.warning("WhatsApp sender %s matches %d users — refusing to guess", sender, len(partial))
    return None


def _to_whatsapp_markup(text: str) -> str:
    """Convert the Markdown the LLM produces into WhatsApp's formatting syntax."""
    text = re.sub(r"^#{1,6}\s*(.+?)\s*#*$", r"*\1*", text, flags=re.MULTILINE)  # headings → bold
    text = re.sub(r"\*\*(.+?)\*\*", r"*\1*", text, flags=re.DOTALL)              # **bold** → *bold*
    text = re.sub(r"__(.+?)__", r"_\1_", text, flags=re.DOTALL)                  # __italic__ → _italic_
    return text


def format_answer(answer: str, sources: list) -> str:
    text = _to_whatsapp_markup(answer).strip()
    if sources:
        refs = "\n".join(f"[{s['number']}] {s['file']}" for s in sorted(sources, key=lambda s: s["number"]))
        text += f"\n\n📎\n{refs}"
    return text


def _split(text: str) -> List[str]:
    """Split text into chunks Twilio accepts, preferring paragraph, then line, then word boundaries."""
    chunks = []
    while len(text) > MAX_MESSAGE_CHARS:
        window = text[:MAX_MESSAGE_CHARS]
        cut = max(window.rfind("\n\n"), window.rfind("\n"), window.rfind(" "))
        if cut <= 0:
            cut = MAX_MESSAGE_CHARS
        chunks.append(text[:cut].rstrip())
        text = text[cut:].lstrip()
    if text:
        chunks.append(text)
    return chunks


def send_message(to: str, text: str) -> None:
    global _client
    if _client is None:
        _client = Client(os.environ["TWILIO_ACCOUNT_SID"], os.environ["TWILIO_AUTH_TOKEN"])
    for chunk in _split(text):
        _client.messages.create(from_=os.environ["TWILIO_WHATSAPP_FROM"], to=to, body=chunk)
