
# EduBot — AI-Powered Educational Chatbot

A production-ready educational chatbot powered by **Google Gemini** with **PostgreSQL** chat history. 
Explains any topic step-by-step, then offers to generate an interactive quiz.

---

## Features

- **Google Gemini 2.5 Flash** — Smart, fast AI tutor  
- **PostgreSQL** — Persistent chat & message history  
- **Auto Quiz Generation** — mixed-type questions per topic  
- **Bilingual** — Responds in Uzbek or English based on user input  
- **Real-time Context** — Last 10 messages used as context  
- **Auto YES Detection** — "ha", "ok", "albatta" → triggers test  
- **Auto Title** — AI generates chat title from first message  
- **Polished Dark UI** — Sidebar + modal test interface  

---

## Project Structure

```
edubot/
├── backend/
│   ├── main.py              # FastAPI routes
│   ├── database.py          # PostgreSQL connection (SQLAlchemy)
│   ├── models.py            # Chat + Message models
│   ├── schemas.py           # Pydantic request/response schemas
│   ├── requirements.txt     # Python dependencies
│   ├── .env.example         # Environment variables template
│   └── services/
│       └── ai_service.py    # Gemini AI integration + YES detection
├── frontend/
│   ├── index.html           # App layout
│   ├── style.css            # Dark theme, responsive
│   └── script.js            # Chat logic, test modal, API calls
├── setup_db.sh              # PostgreSQL database setup
└── README.md
```

---

## Quick Start

### 1. Prerequisites

- Python 3.10+
- PostgreSQL 14+
- Google Gemini API key → [Get it here](https://aistudio.google.com/app/apikey)

---

### 2. Database Setup

Create a database using pgAdmin. 
Database name "edubot_db 
---

### 3. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate        # Linux/Mac
# venv\Scripts\activate         # Windows

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY

# Run server
uvicorn main:app --reload --port 8000
```

The backend will:
- Auto-create `chats` and `messages` tables in PostgreSQL on first run
- Serve the frontend at `http://localhost:8000`

---

### 4. Frontend

Open `http://localhost:8000` in your browser.

Or for local development, open `frontend/index.html` directly 
(change `API = 'http://localhost:8000'` in `script.js` if needed).

---

## API Reference

### Start a new chat
```http
POST /chat/start
Content-Type: application/json

{"content": "Python dasturlash tili nima?"}
```
**Response:**
```json
{
  "chat_id": "uuid-here",
  "title": "Python dasturlash asoslari",
  "ai_response": "Python — ..."
}
```

---

### Send message in existing chat
```http
POST /chat/{chat_id}/message
Content-Type: application/json

{"content": "ha"}
```
**Response (quiz JSON when user agrees to test):**
```json
{
  "ai_response": "{\"topic\":\"Python\",\"questions\":[...]}"
}
```

---

### List all chats
```http
GET /chat/list
```
**Response:**
```json
[
  {"id": "uuid", "title": "Python asoslari", "created_at": "2024-..."}
]
```

---

### Get chat history
```http
GET /chat/{chat_id}
```
**Response:**
```json
[
  {"id": "uuid", "role": "user", "content": "...", "created_at": "..."},
  {"id": "uuid", "role": "assistant", "content": "...", "created_at": "..."}
]
```

---

### Delete a chat
```http
DELETE /chat/{chat_id}
```

---

## Test JSON Format

When user agrees to a quiz, Gemini returns strict JSON:

```json
{
  "topic": "Python asoslari",
  "questions": [
    {
      "type": "single_choice",
      "question": "Python qaysi yilda yaratilgan?",
      "options": ["A) 1989", "B) 1991", "C) 2000", "D) 2008"],
      "correct_answer": "B"
    },
    {
      "type": "multi_choice",
      "question": "Quyidagilardan qaysilari Python ma'lumot turlari?",
      "options": ["A) int", "B) char", "C) float", "D) str"],
      "correct_answer": ["A", "C", "D"]
    },
    {
      "type": "short_answer",
      "question": "Python'da izoh qo'shish uchun qaysi belgi ishlatiladi?",
      "correct_answer": "#"
    }
  ]
}
```

---

## Auto YES Detection

The system auto-detects affirmative responses in both Uzbek and English:

| Input | Detected as |
|-------|-------------|
| `ha` | ✅ YES |
| `albatta` | ✅ YES |
| `tuzib ber` | ✅ YES |
| `yes` / `ok` / `sure` | ✅ YES |
| `yup` / `go ahead` | ✅ YES |

---

## Database Schema

```sql
CREATE TABLE chats (
    id         VARCHAR(36) PRIMARY KEY,
    title      TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL
);

CREATE TABLE messages (
    id         VARCHAR(36) PRIMARY KEY,
    chat_id    VARCHAR(36) REFERENCES chats(id) ON DELETE CASCADE,
    role       VARCHAR(20) NOT NULL,   -- 'user' | 'assistant'
    content    TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL
);
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GEMINI_API_KEY` | Google Gemini API key | **Required** |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:DB_PASSWORD@localhost:5432/edubot_db` |


---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| AI | Google Gemini 2.5 Flash |
| Backend | FastAPI + Python |
| ORM | SQLAlchemy |
| Database | PostgreSQL |
| Validation | Pydantic v2 |
| Frontend | Vanilla HTML/CSS/JS |
| Fonts | DM Serif Display + DM Sans |

---

## Example curl Requests

```bash
# Start a new chat
curl -X POST http://localhost:8000/chat/start \
  -H "Content-Type: application/json" \
  -d '{"content": "Kvant fizikasi nima?"}'

# Send a message
curl -X POST http://localhost:8000/chat/{CHAT_ID}/message \
  -H "Content-Type: application/json" \
  -d '{"content": "ha, test tuz"}'

# Get all chats
curl http://localhost:8000/chat/list

# Get chat history
curl http://localhost:8000/chat/{CHAT_ID}
```

---

## Troubleshooting

**`psycopg2` error** → Make sure PostgreSQL is running: `sudo service postgresql start`

**Gemini API error** → Check your `.env` file has the correct `GEMINI_API_KEY`

**CORS error** → Make sure backend is running on port 8000

**Tables not created** → Backend auto-creates them on startup via `Base.metadata.create_all()`
