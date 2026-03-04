import { create } from 'zustand';
import api from '../lib/api';

type Role = 'guest' | 'customer' | 'agent' | 'admin';

interface User {
  id: string;
  username: string;
  email?: string;
  role: Role;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  guestLogin: () => Promise<void>;
  logout: () => void;
}

function storeAuth(data: AuthTokens & { user: User }): void {
  localStorage.setItem('accessToken', data.accessToken);
  localStorage.setItem('refreshToken', data.refreshToken);
  localStorage.setItem('user', JSON.stringify(data.user));
}

function loadUser(): User | null {
  const raw = localStorage.getItem('user');
  if (raw) {
    try {
      return JSON.parse(raw) as User;
    } catch {
      localStorage.clear();
    }
  }
  return null;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: loadUser(),
  isLoading: false,

  login: async (email: string, password: string) => {
    set({ isLoading: true });
    try {
      const { data } = await api.post<AuthResponse>('/auth/login', {
        email,
        password,
      });
      storeAuth(data);
      set({ user: data.user, isLoading: false });
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  register: async (username: string, email: string, password: string) => {
    set({ isLoading: true });
    try {
      const { data } = await api.post<AuthResponse>('/auth/register', {
        username,
        email,
        password,
      });
      storeAuth(data);
      set({ user: data.user, isLoading: false });
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  guestLogin: async () => {
    set({ isLoading: true });
    try {
      const { data } = await api.post<AuthResponse>('/auth/guest');
      storeAuth(data);
      set({ user: data.user, isLoading: false });
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  logout: () => {
    localStorage.clear();
    set({ user: null });
  },

}));
