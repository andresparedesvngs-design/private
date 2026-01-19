import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
  }
  return socket;
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

    return () => {
      socket.off('session:created');
      socket.off('session:updated');
      socket.off('session:deleted');
      socket.off('session:qr');
      socket.off('session:ready');
      socket.off('session:auth_failed');
      socket.off('session:disconnected');
      socket.off('campaign:started');
      socket.off('campaign:paused');
      socket.off('campaign:progress');
      socket.off('campaign:updated');
    };
  }, [queryClient]);
}
