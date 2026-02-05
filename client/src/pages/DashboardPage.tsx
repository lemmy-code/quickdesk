import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const rooms = useChatStore((s) => s.rooms);
  const fetchRooms = useChatStore((s) => s.fetchRooms);
  const createRoom = useChatStore((s) => s.createRoom);
  const [title, setTitle] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchRooms().catch(() => toast.error('Failed to load rooms'));
  }, [fetchRooms]);

  const handleNewChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      const room = await createRoom(title.trim());
      setTitle('');
      navigate(`/chat/${room.id}`);
    } catch {
      toast.error('Failed to create room');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isCustomerOrGuest = user?.role === 'customer' || user?.role === 'guest';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <h1 className="text-xl font-bold text-gray-900">QuickDesk</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">
              {user?.username}{' '}
              <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                {user?.role}
              </span>
            </span>
            <button
              onClick={handleLogout}
              className="rounded-md bg-red-50 px-3 py-1.5 text-sm text-red-600 hover:bg-red-100"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6">
        {/* New Chat Form */}
        {isCustomerOrGuest && (
          <form onSubmit={handleNewChat} className="mb-6 flex gap-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Describe your issue..."
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              New Chat
            </button>
          </form>
        )}

        {/* Room List */}
        <div className="space-y-2">
          {rooms.length === 0 && (
            <p className="py-8 text-center text-gray-400">No rooms yet.</p>
          )}
          {rooms.map((room) => (
            <button
              key={room.id}
              onClick={() => navigate(`/chat/${room.id}`)}
              className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 text-left shadow-sm hover:bg-gray-50"
            >
              <div>
                <p className="font-medium text-gray-900">{room.title}</p>
                <p className="text-sm text-gray-500">
                  Created {new Date(room.createdAt).toLocaleDateString()}
                </p>
              </div>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
