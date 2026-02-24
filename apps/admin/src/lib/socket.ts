import { io, Socket } from 'socket.io-client';
import { getToken } from './auth';

// Socket.io connects to the base server URL (no /api/v1 prefix)
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(`${SOCKET_URL}/admin`, {
      auth: { token: getToken() },
      transports: ['websocket', 'polling'],
      autoConnect: false,
    });
  }
  return socket;
}

export function connectSocket() {
  const s = getSocket();
  if (!s.connected) {
    s.auth = { token: getToken() };
    s.connect();
    s.emit('admin:subscribe');
  }
  return s;
}

export function disconnectSocket() {
  if (socket?.connected) {
    socket.disconnect();
  }
}
