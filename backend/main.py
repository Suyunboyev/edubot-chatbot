from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import uuid
from datetime import datetime
from typing import List, Optional

from database import engine, get_db
from models import Base, Chat, Message
from schemas import (
    ChatCreate, ChatResponse, ChatListItem,
    MessageCreate, MessageResponse, SendMessageRequest, SendMessageResponse
)
from services.ai_service import AIService

import sqlalchemy as sa
from sqlalchemy.orm import Session
from fastapi import Depends
import os

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="EduBot AI", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

ai_service = AIService()

# Serve frontend
app.mount("/static", StaticFiles(directory="../frontend"), name="static")

@app.get("/")
def serve_frontend():
    return FileResponse("../frontend/index.html")


@app.post("/chat/start", response_model=ChatResponse)
def start_chat(request: SendMessageRequest, db: Session = Depends(get_db)):
    """Create a new chat session with the first message."""
    chat_id = str(uuid.uuid4())
    
    # Generate title from first message using AI
    title = ai_service.generate_title(request.content)
    
    # Create chat
    chat = Chat(id=chat_id, title=title, created_at=datetime.utcnow())
    db.add(chat)
    
    # Save user message
    user_msg = Message(
        id=str(uuid.uuid4()),
        chat_id=chat_id,
        role="user",
        content=request.content,
        created_at=datetime.utcnow()
    )
    db.add(user_msg)
    db.commit()
    
    # Get AI response (no history yet)
    ai_response = ai_service.get_response(request.content, [])
    
    # Save AI response
    ai_msg = Message(
        id=str(uuid.uuid4()),
        chat_id=chat_id,
        role="assistant",
        content=ai_response,
        created_at=datetime.utcnow()
    )
    db.add(ai_msg)
    db.commit()
    
    return ChatResponse(
        chat_id=chat_id,
        title=title,
        ai_response=ai_response
    )


@app.post("/chat/{chat_id}/message", response_model=SendMessageResponse)
def send_message(chat_id: str, request: SendMessageRequest, db: Session = Depends(get_db)):
    """Send a message in an existing chat."""
    # Verify chat exists
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    
    # Save user message
    user_msg = Message(
        id=str(uuid.uuid4()),
        chat_id=chat_id,
        role="user",
        content=request.content,
        created_at=datetime.utcnow()
    )
    db.add(user_msg)
    db.commit()
    
    # Load last 10 messages for context (excluding the one we just added)
    history = db.query(Message)\
        .filter(Message.chat_id == chat_id)\
        .order_by(Message.created_at.desc())\
        .limit(11)\
        .all()
    history = list(reversed(history[1:]))  # exclude current user message
    
    history_dicts = [{"role": m.role, "content": m.content} for m in history]
    
    # Get AI response
    ai_response = ai_service.get_response(request.content, history_dicts)
    
    # Save AI response
    ai_msg = Message(
        id=str(uuid.uuid4()),
        chat_id=chat_id,
        role="assistant",
        content=ai_response,
        created_at=datetime.utcnow()
    )
    db.add(ai_msg)
    db.commit()
    
    return SendMessageResponse(ai_response=ai_response)


@app.get("/chat/list", response_model=List[ChatListItem])
def list_chats(db: Session = Depends(get_db)):
    """Return all chats ordered by newest first."""
    chats = db.query(Chat).order_by(Chat.created_at.desc()).all()
    return [ChatListItem(id=c.id, title=c.title, created_at=c.created_at) for c in chats]


@app.get("/chat/{chat_id}", response_model=List[MessageResponse])
def get_chat(chat_id: str, db: Session = Depends(get_db)):
    """Return full message history for a chat."""
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    
    messages = db.query(Message)\
        .filter(Message.chat_id == chat_id)\
        .order_by(Message.created_at.asc())\
        .all()
    
    return [MessageResponse(
        id=m.id,
        role=m.role,
        content=m.content,
        created_at=m.created_at
    ) for m in messages]


@app.delete("/chat/{chat_id}")
def delete_chat(chat_id: str, db: Session = Depends(get_db)):
    """Delete a chat and its messages."""
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    db.query(Message).filter(Message.chat_id == chat_id).delete()
    db.delete(chat)
    db.commit()
    return {"status": "deleted"}
