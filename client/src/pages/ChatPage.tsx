import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { connectSocket, disconnectSocket } from '../lib/socket';
import type { Message } from '../stores/chatStore';

interface TypingUpdatePayload {
  userId: string;
  username: string;
  roomId: string;
  isTyping: boolean;
}

interface SystemMessagePayload {
  content: string;
  roomId: string;
  sentAt: string;
}

interface SocketErrorPayload {
  message: string;
}

export function ChatPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const messages = useChatStore((s) => s.messages);
  const typingUsers = useChatStore((s) => s.typingUsers);
  const fetchMessages = useChatStore((s) => s.fetchMessages);
  const addMessage = useChatStore((s) => s.addMessage);
  const setTypingUser = useChatStore((s) => s.setTypingUser);
  const setCurrentRoom = useChatStore((s) => s.setCurrentRoom);

  const [body, setBody] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (!roomId) return;

    // Fetch message history
    fetchMessages(roomId).catch(() => toast.error('Failed to load messages'));

    // Connect socket
    const socket = connectSocket();

    socket.emit('room:join', roomId);

    const handleNewMessage = (msg: Message) => {
      addMessage(msg);
    };

    const handleTypingUpdate = (data: TypingUpdatePayload) => {
      setTypingUser({ id: data.userId, username: data.username }, data.isTyping);
    };

    const handleSystemMessage = (data: SystemMessagePayload) => {
      const systemMsg: Message = {
        id: `sys-${Date.now()}-${Math.random()}`,
        roomId: data.roomId,
        sender: null,
        content: data.content,
        type: 'system',
        sentAt: data.sentAt,
      };
      addMessage(systemMsg);
    };

    const handleError = (data: SocketErrorPayload) => {
      toast.error(data.message);
    };

    socket.on('message:new', handleNewMessage);
    socket.on('typing:update', handleTypingUpdate);
    socket.on('system:message', handleSystemMessage);
    socket.on('error', handleError);

    return () => {
      socket.emit('room:leave', roomId);
      socket.off('message:new', handleNewMessage);
      socket.off('typing:update', handleTypingUpdate);
      socket.off('system:message', handleSystemMessage);
      socket.off('error', handleError);
      disconnectSocket();
      setCurrentRoom(null);
    };
  }, [roomId, fetchMessages, addMessage, setTypingUser, setCurrentRoom]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBody(e.target.value);

    const socket = connectSocket();
    socket.emit('typing:start', { roomId });

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing:stop', { roomId });
    }, 2000);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim() || !roomId) return;

    const socket = connectSocket();
    socket.emit('message:send', { roomId, content: body.trim() });

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    socket.emit('typing:stop', { roomId });

    setBody('');
  };

  const isSystemMessage = (msg: Message) => msg.type === 'system' || !msg.sender;
  const isOwnMessage = (msg: Message) => msg.sender?.id === user?.id;

  const filteredTyping = typingUsers.filter((u) => u.id !== user?.id);

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <button
            onClick={() => navigate('/')}
            className="rounded-md px-2 py-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            &larr; Back
          </button>
          <h1 className="text-lg font-bold text-gray-900">Chat</h1>
        </div>
      </header>

      {/* Messages */}
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-4">
        <div className="flex-1 space-y-3 overflow-y-auto">
          {messages.map((msg) => {
            if (isSystemMessage(msg)) {
              return (
                <div key={msg.id} className="text-center">
                  <span className="text-xs text-gray-400">{msg.content}</span>
                </div>
              );
            }

            if (isOwnMessage(msg)) {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-xs rounded-lg bg-blue-600 px-4 py-2 text-white lg:max-w-md">
                    <p className="text-sm">{msg.content}</p>
                    <p className="mt-1 text-right text-xs text-blue-200">
                      {new Date(msg.sentAt).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              );
            }

            return (
              <div key={msg.id} className="flex justify-start">
                <div className="max-w-xs rounded-lg border border-gray-200 bg-white px-4 py-2 lg:max-w-md">
                  <p className="text-xs font-medium text-gray-500">
                    {msg.sender?.username}
                  </p>
                  <p className="text-sm text-gray-900">{msg.content}</p>
                  <p className="mt-1 text-xs text-gray-400">
                    {new Date(msg.sentAt).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Typing Indicator */}
        {filteredTyping.length > 0 && (
          <p className="mt-1 text-xs text-gray-400">
            {filteredTyping.map((u) => u.username).join(', ')}{' '}
            {filteredTyping.length === 1 ? 'is' : 'are'} typing...
          </p>
        )}

        {/* Input */}
        <form onSubmit={handleSend} className="mt-3 flex gap-2">
          <input
            type="text"
            value={body}
            onChange={handleInputChange}
            placeholder="Type a message..."
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={!body.trim()}
            className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </main>
    </div>
  );
}
