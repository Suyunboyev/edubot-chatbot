from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class SendMessageRequest(BaseModel):
    content: str


class ChatResponse(BaseModel):
    chat_id: str
    title: str
    ai_response: str


class ChatListItem(BaseModel):
    id: str
    title: str
    created_at: datetime

    class Config:
        from_attributes = True


class MessageResponse(BaseModel):
    id: str
    role: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True


class SendMessageResponse(BaseModel):
    ai_response: str


class ChatCreate(BaseModel):
    first_message: str


class MessageCreate(BaseModel):
    role: str
    content: str
