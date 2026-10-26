"use client";

import { useEffect, useState } from "react";
import { getSocket } from "@/lib/socket";

export function useSocket() {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = getSocket();
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    if (socket.connected) onConnect();
    else socket.connect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  return { socket: getSocket, connected };
}
