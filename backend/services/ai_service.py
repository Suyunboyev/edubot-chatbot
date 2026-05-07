import os
import json
import re
import google.generativeai as genai
from typing import List, Dict

genai.configure(api_key=os.getenv("GEMINI_API_KEY", ""))

TUTOR_SYSTEM_PROMPT = """Sen qisqa, aniq, lekin tushunarli va strukturali javob beradigan aqlli va mehribon shaxsiy o'qituvchisan.

QOIDALAR:

1. Javobni optimal uzunlikda ber:
   - Odatda 3-5 blokdan oshmasin
   - Juda qisqa qilib tushunarsiz qilma
   - Keraksiz gaplar yozma

2. Tushuntirish strukturasi DOIMO quyidagicha bo'lsin:
   - Qisqa ta'rif (1-2 gap)
   - Asosiy tushuntirish
   - 1-2 ta misol

3. Agar mavzu murakkab bo'lsa:
   - Jadvaldan foydalan (markdown table format: | Col | Col |)
   - yoki oddiy ASCII diagram chiz
   - yoki bosqichma-bosqich ko'rsat

4. Jadval ishlatish qoidasi:
   - Faqat foydali bo'lsa ishlat
   - Markdown jadval formatida yoz: | Ustun | Ustun |\n|---|---|\n| qiymat | qiymat |
   - 2-6 qator yetarli

5. Diagram (ASCII) ishlatish:
   - Faqat tushunishni osonlashtirsa
   - Sodda bo'lsin: A → B → C yoki [Input] → [Process] → [Output]

6. Murakkab matn yozma:
   - uzun akademik gaplar yozma
   - ortiqcha izohlar yozma
   - "umid qilamanki..." kabi iboralar yozma

7. Tokenni tejash:
   - Keraksiz gap yozma
   - Takrorlama
   - Maksimal foyda / minimal matn

8. Har bir tushuntirish oxirida FAQAT shu qatorni yoz:
"Shu mavzu bo'yicha test tuzib beraymi?"

---

TEST QOIDALARI:

9. Foydalanuvchi test so'raganda:
   - Aniq son aytsa (masalan "10 ta", "6 savol") → aynan shu son
   - "ha", "ok", "yes", "albatta" → 5 ta savol

10. Test format - FAQAT JSON (hech qanday boshqa matn, markdown, izoh yo'q):

{"topic":"mavzu nomi","questions":[{"type":"single_choice","question":"savol","options":["A) ...","B) ...","C) ...","D) ..."],"correct_answer":"A"},{"type":"multi_choice","question":"savol","options":["A) ...","B) ...","C) ...","D) ..."],"correct_answer":["A","C"]},{"type":"short_answer","question":"savol","correct_answer":"javob"}]}

11. Savollarni aralashtir: single_choice, multi_choice, short_answer

---

12. 
- Foydalanuvchi qaysi tilda yozsa, javobni FAQAT shu tilda yoz.
- Agar savol ingliz tilida bo‘lsa → javob ingliz tilida bo‘lsin.
- Agar savol o‘zbek tilida bo‘lsa → javob o‘zbek tilida bo‘lsin.
- Agar savol rus tilida bo‘lsa → javob rus tilida bo‘lsin.

- Hech qachon tilni o‘zgartirma.
- Hech qachon tarjima qilib bermagin (agar user so‘ramasa).
- Agar tilni aniqlash qiyin bo‘lsa → savol qaysi tilga yaqin bo‘lsa, o‘sha tilni tanla.

13. Testdan keyin suhbatni davom ettir.

14. Agar foydalanuvchi tushunmagan bo'lsa: boshqacha (oddiyroq) usulda tushuntir, diagram yoki misol bilan.
"""

YES_PATTERNS = re.compile(
    r"\b(ha|yes|ok|okay|yep|sure|albatta|tuzib\s*ber|rozi|mayli|bo'pti|qo'y|lol|yup|gladly|please|of\s*course|go\s*ahead|do\s*it|make\s*it)\b",
    re.IGNORECASE
)

# Pattern: "10 ta", "6 ta", "10ta" etc.
COUNT_PATTERNS = re.compile(r'(\d+)\s*ta\b', re.IGNORECASE)

model = genai.GenerativeModel(
    model_name="gemini-2.5-flash",
    system_instruction=TUTOR_SYSTEM_PROMPT
)


def is_yes_response(text: str) -> bool:
    return bool(YES_PATTERNS.search(text.strip()))


def extract_question_count(text: str) -> int | None:
    """Extract requested number of questions from user message."""
    m = COUNT_PATTERNS.search(text)
    if m:
        n = int(m.group(1))
        return max(1, min(n, 30))  # clamp between 1–30
    # Also handle plain numbers like "10 savol", "6 questions"
    m2 = re.search(r'(\d+)\s*(savol|question|test)', text, re.IGNORECASE)
    if m2:
        n = int(m2.group(1))
        return max(1, min(n, 30))
    return None


class AIService:
    def generate_title(self, first_message: str) -> str:
        try:
            title_model = genai.GenerativeModel("gemini-2.5-flash")
            response = title_model.generate_content(
                f"Create a short, descriptive title (max 6 words) for a chat that starts with this message. "
                f"Return ONLY the title, nothing else.\n\nMessage: {first_message}"
            )
            title = response.text.strip().strip('"').strip("'")
            return title[:80] if title else first_message[:50]
        except Exception:
            return first_message[:50]

    def get_response(self, user_message: str, history: List[Dict]) -> str:
        try:
            test_requested = is_yes_response(user_message) and len(history) > 0
            question_count = extract_question_count(user_message)

            # Build chat history for Gemini
            chat_history = []
            for msg in history:
                role = "user" if msg["role"] == "user" else "model"
                chat_history.append({"role": role, "parts": [msg["content"]]})

            chat = model.start_chat(history=chat_history)

            if test_requested or question_count:
                count = question_count or 5
                prompt = (
                    f"Foydalanuvchi: '{user_message}'\n"
                    f"Aynan {count} ta savoldan iborat test tuz. "
                    f"FAQAT JSON yoz — hech qanday boshqa matn, izoh, markdown belgisi yozma. "
                    f"JSON dan oldin ham, keyin ham hech narsa yozma."
                )
            else:
                prompt = user_message

            response = chat.send_message(prompt)
            return response.text.strip()

        except Exception as e:
            return f"Xatolik yuz berdi: {str(e)}. Iltimos, qayta urinib ko'ring."

    def parse_test_json(self, text: str) -> dict | None:
        return extract_test_json(text)


def extract_test_json(text: str) -> dict | None:
    """Robustly extract test JSON from AI response."""
    # 1. Try direct parse
    try:
        parsed = json.loads(text)
        if _is_valid_test(parsed):
            return parsed
    except json.JSONDecodeError:
        pass

    # 2. Strip ```json ... ``` or ``` ... ``` fences
    fence_match = re.search(r'```(?:json)?\s*([\s\S]*?)```', text)
    if fence_match:
        try:
            parsed = json.loads(fence_match.group(1).strip())
            if _is_valid_test(parsed):
                return parsed
        except json.JSONDecodeError:
            pass

    # 3. Extract first { ... } block (greedy from first { to last })
    brace_match = re.search(r'\{[\s\S]*\}', text)
    if brace_match:
        try:
            parsed = json.loads(brace_match.group())
            if _is_valid_test(parsed):
                return parsed
        except json.JSONDecodeError:
            pass

    # 4. Try to fix common issues: trailing commas, single quotes
    cleaned = text
    cleaned = re.sub(r',\s*([}\]])', r'\1', cleaned)  # trailing commas
    brace_match2 = re.search(r'\{[\s\S]*\}', cleaned)
    if brace_match2:
        try:
            parsed = json.loads(brace_match2.group())
            if _is_valid_test(parsed):
                return parsed
        except json.JSONDecodeError:
            pass

    return None


def _is_valid_test(obj) -> bool:
    return (
        isinstance(obj, dict)
        and "questions" in obj
        and isinstance(obj["questions"], list)
        and len(obj["questions"]) > 0
    )