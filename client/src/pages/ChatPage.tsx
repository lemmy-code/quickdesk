import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { connectSocket, disconnectSocket } from '../lib/socket';
import api from '../lib/api';
import type { Message, Room } from '../stores/chatStore';

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
  const hasMore = useChatStore((s) => s.hasMore);
  const nextCursor = useChatStore((s) => s.nextCursor);
  const fetchMessages = useChatStore((s) => s.fetchMessages);
  const addMessage = useChatStore((s) => s.addMessage);
  const setTypingUser = useChatStore((s) => s.setTypingUser);
  const setCurrentRoom = useChatStore((s) => s.setCurrentRoom);

  const [body, setBody] = useState('');
  const [room, setRoom] = useState<Room | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Fetch room details
  useEffect(() => {
    if (!roomId) return;
    api.get<Room>(`/rooms/${roomId}`)
      .then(({ data }) => setRoom(data))
      .catch(() => toast.error('Failed to load room'));
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;

    setLoadingMessages(true);
    fetchMessages(roomId)
      .catch(() => toast.error('Failed to load messages'))
      .finally(() => setLoadingMessages(false));

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

  const handleLoadOlder = async () => {
    if (!roomId || !nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      await fetchMessages(roomId, nextCursor);
    } catch {
      toast.error('Failed to load older messages');
    } finally {
      setLoadingOlder(false);
    }
  };

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

  const handleCloseRoom = async () => {
    if (!roomId) return;
    try {
      await api.patch(`/rooms/${roomId}/close`);
      toast.success('Room closed');
      setRoom((prev) => prev ? { ...prev, status: 'closed' } : prev);
    } catch {
      toast.error('Failed to close room');
    }
  };

  const isSystemMessage = (msg: Message) => msg.type === 'system' || !msg.sender;
  const isOwnMessage = (msg: Message) => msg.sender?.id === user?.id;
  const isAgentOrAdmin = user?.role === 'agent' || user?.role === 'admin';
  const isClosed = room?.status === 'closed';

  const filteredTyping = typingUsers.filter((u) => u.id !== user?.id);

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="rounded-md px-2 py-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            >
              &larr; Back
            </button>
            <div>
              <h1 className="text-lg font-bold text-gray-900">
                {room?.title || 'Chat'}
              </h1>
              {room && (
                <p className="text-xs text-gray-500">
                  {room.status === 'closed'
                    ? 'Closed'
                    : room.agent
                      ? `Agent: ${room.agent.username}`
                      : 'Waiting for agent...'}
                </p>
              )}
            </div>
          </div>
          {isAgentOrAdmin && !isClosed && (
            <button
              onClick={handleCloseRoom}
              className="rounded-md bg-red-50 px-3 py-1.5 text-sm text-red-600 hover:bg-red-100"
            >
              Close Room
            </button>
          )}
        </div>
      </header>

      {/* Messages */}
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col overflow-hidden px-4 py-4">
        <div className="flex-1 space-y-3 overflow-y-auto">
          {/* Load older */}
          {hasMore && (
            <div className="text-center">
              <button
                onClick={handleLoadOlder}
                disabled={loadingOlder}
                className="text-sm text-blue-600 hover:underline disabled:text-gray-400"
              >
                {loadingOlder ? 'Loading...' : 'Load older messages'}
              </button>
            </div>
          )}

          {loadingMessages ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
            </div>
          ) : messages.length === 0 ? (
            <p className="py-12 text-center text-gray-400">
              No messages yet. Start the conversation!
            </p>
          ) : (
            messages.map((msg) => {
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
            })
          )}
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
        {isClosed ? (
          <p className="mt-3 rounded-md bg-gray-100 px-4 py-3 text-center text-sm text-gray-500">
            This room has been closed.
          </p>
        ) : (
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
        )}
      </main>
    </div>
  );
}
