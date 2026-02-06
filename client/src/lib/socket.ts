import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      autoConnect: false,
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
  }
  return socket;
}

export function disconnectSocket() {
  if (socket?.connected) {
    socket.disconnect();
  }
}

export function useSocket() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getSocket();

    socket.on('session:created', () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    });

    socket.on('session:updated', () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    });

    socket.on('session:deleted', () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    });

    socket.on('session:qr', () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    });

    socket.on('session:ready', () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    });

    socket.on('session:auth_failed', () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    });

    socket.on('session:disconnected', () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    });

    socket.on('pool:updated', () => {
      queryClient.invalidateQueries({ queryKey: ['pools'] });
    });

    socket.on('campaign:started', () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    });

    socket.on('campaign:paused', () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    });

    socket.on('campaign:progress', () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    });

    socket.on('campaign:updated', () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    });

    socket.on('message:created', () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['debtors'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    });

    socket.on('message:received', () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['debtors'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    });

    socket.on('message:status', () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
    });

    socket.on('message:edited', () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
    });

    socket.connect();

    return () => {
      socket.off('session:created');
      socket.off('session:updated');
      socket.off('session:deleted');
      socket.off('session:qr');
      socket.off('session:ready');
      socket.off('session:auth_failed');
      socket.off('session:disconnected');
      socket.off('pool:updated');
      socket.off('campaign:started');
      socket.off('campaign:paused');
      socket.off('campaign:progress');
      socket.off('campaign:updated');
      socket.off('message:created');
      socket.off('message:received');
      socket.off('message:status');
      socket.off('message:edited');

      socket.disconnect();
    };
  }, [queryClient]);
}
