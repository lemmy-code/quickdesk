import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import api from '../lib/api';

const statusStyles = {
  waiting: 'bg-yellow-100 text-yellow-800',
  active: 'bg-green-100 text-green-800',
  closed: 'bg-gray-100 text-gray-500',
} as const;

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const rooms = useChatStore((s) => s.rooms);
  const fetchRooms = useChatStore((s) => s.fetchRooms);
  const createRoom = useChatStore((s) => s.createRoom);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchRooms()
      .catch(() => toast.error('Failed to load rooms'))
      .finally(() => setLoading(false));
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

  const handleAssign = async (roomId: string) => {
    if (!user) return;
    try {
      await api.patch(`/rooms/${roomId}/assign`, { agentId: user.id });
      toast.success('Room assigned to you');
      await fetchRooms();
    } catch {
      toast.error('Failed to assign room');
    }
  };

  const handleClose = async (roomId: string) => {
    try {
      await api.patch(`/rooms/${roomId}/close`);
      toast.success('Room closed');
      await fetchRooms();
    } catch {
      toast.error('Failed to close room');
    }
  };

  const isCustomerOrGuest = user?.role === 'customer' || user?.role === 'guest';
  const isAgentOrAdmin = user?.role === 'agent' || user?.role === 'admin';

  return (
    <div className="min-h-screen bg-gray-50">
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
        {isCustomerOrGuest && (
          <form onSubmit={handleNewChat} className="mb-6 flex gap-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Describe your issue..."
              aria-label="Issue title"
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={!title.trim()}
              className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              New Chat
            </button>
          </form>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
          </div>
        ) : rooms.length === 0 ? (
          <p className="py-8 text-center text-gray-400">
            {isCustomerOrGuest
              ? 'No conversations yet. Start a new chat above.'
              : 'No open support rooms.'}
          </p>
        ) : (
          <div className="space-y-2">
            {rooms.map((room) => (
              <div
                key={room.id}
                className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <button
                  onClick={() => navigate(`/chat/${room.id}`)}
                  className="flex-1 text-left"
                >
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900">{room.title}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[room.status] || statusStyles.waiting}`}
                    >
                      {room.status}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-sm text-gray-500">
                    {room.creator && (
                      <span>by {room.creator.username}</span>
                    )}
                    {room.agent && (
                      <span>agent: {room.agent.username}</span>
                    )}
                    {room._count && (
                      <span>{room._count.messages} msgs</span>
                    )}
                    <span>{new Date(room.createdAt).toLocaleDateString()}</span>
                  </div>
                </button>

                {isAgentOrAdmin && room.status !== 'closed' && (
                  <div className="ml-3 flex gap-2">
                    {!room.assignedTo && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAssign(room.id);
                        }}
                        className="rounded-md bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                      >
                        Assign to me
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClose(room.id);
                      }}
                      className="rounded-md bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100"
                    >
                      Close
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
