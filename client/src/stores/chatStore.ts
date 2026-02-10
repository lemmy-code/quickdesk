import { create } from 'zustand';
import api from '../lib/api';

export interface Room {
  id: string;
  title: string;
  status: 'waiting' | 'active' | 'closed';
  createdBy: string;
  createdAt: string;
  assignedTo: string | null;
  closedAt: string | null;
  creator?: { id: string; username: string; role: string };
  agent?: { id: string; username: string; role: string } | null;
  _count?: { messages: number };
}

export interface Message {
  id: string;
  roomId: string;
  sender: {
    id: string;
    username: string;
  } | null;
  content: string;
  type?: string;
  sentAt: string;
}

interface TypingUser {
  id: string;
  username: string;
}

interface FetchMessagesResponse {
  messages: Message[];
  nextCursor: string | null;
}

interface ChatState {
  rooms: Room[];
  currentRoom: Room | null;
  messages: Message[];
  typingUsers: TypingUser[];
  hasMore: boolean;
  nextCursor: string | null;

  fetchRooms: () => Promise<void>;
  createRoom: (title: string) => Promise<Room>;
  setCurrentRoom: (room: Room | null) => void;
  fetchMessages: (roomId: string, cursor?: string) => Promise<void>;
  addMessage: (msg: Message) => void;
  setTypingUser: (user: TypingUser, isTyping: boolean) => void;
  updateRoom: (partialRoom: Partial<Room> & { id: string }) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  rooms: [],
  currentRoom: null,
  messages: [],
  typingUsers: [],
  hasMore: false,
  nextCursor: null,

  fetchRooms: async () => {
    const { data } = await api.get<Room[]>('/rooms');
    set({ rooms: data });
  },

  createRoom: async (title: string) => {
    const { data } = await api.post<Room>('/rooms', { title });
    set({ rooms: [...get().rooms, data] });
    return data;
  },

  setCurrentRoom: (room: Room | null) => {
    set({ currentRoom: room, messages: [], hasMore: false, nextCursor: null, typingUsers: [] });
  },

  fetchMessages: async (roomId: string, cursor?: string) => {
    const params: Record<string, string> = {};
    if (cursor) params.cursor = cursor;
    const { data } = await api.get<FetchMessagesResponse>(
      `/rooms/${roomId}/messages`,
      { params },
    );
    const existing = cursor ? get().messages : [];
    set({
      messages: [...data.messages, ...existing],
      nextCursor: data.nextCursor,
      hasMore: data.nextCursor !== null,
    });
  },

  addMessage: (msg: Message) => {
    set({ messages: [...get().messages, msg] });
  },

  setTypingUser: (user: TypingUser, isTyping: boolean) => {
    const current = get().typingUsers;
    if (isTyping) {
      if (!current.find((u) => u.id === user.id)) {
        set({ typingUsers: [...current, user] });
      }
    } else {
      set({ typingUsers: current.filter((u) => u.id !== user.id) });
    }
  },

  updateRoom: (partialRoom: Partial<Room> & { id: string }) => {
    set({
      rooms: get().rooms.map((r) =>
        r.id === partialRoom.id ? { ...r, ...partialRoom } : r,
      ),
    });
  },
}));
