#!/usr/bin/python
# -*- coding: utf-8 -*-
"""UDP LAN discovery responder for fixed-port redViewer backends."""

import json
import socket
import threading

from core.logging import get_logger


logger = get_logger()

DISCOVERY_APP = "redViewer"
DISCOVERY_VERSION = 1


class LanDiscoveryResponder:
    def __init__(self, http_port: int):
        self.http_port = http_port
        self._stop = threading.Event()
        self._socket: socket.socket | None = None
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._thread:
            return
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.settimeout(1.0)
        try:
            sock.bind(("0.0.0.0", self.http_port))
        except OSError as exc:
            sock.close()
            logger.warning(f"LAN discovery disabled: cannot bind UDP {self.http_port}: {exc}")
            return
        self._socket = sock
        self._thread = threading.Thread(target=self._serve, name="rv-lan-discovery", daemon=True)
        self._thread.start()
        logger.debug(f"LAN discovery listening on UDP {self.http_port}")

    def stop(self) -> None:
        self._stop.set()
        if self._socket:
            self._socket.close()
            self._socket = None
        if self._thread:
            self._thread.join(timeout=1.5)
            self._thread = None

    def _serve(self) -> None:
        assert self._socket is not None
        while not self._stop.is_set():
            try:
                data, addr = self._socket.recvfrom(1024)
            except socket.timeout:
                continue
            except OSError:
                if not self._stop.is_set():
                    logger.warning("LAN discovery socket closed unexpectedly")
                break
            if not self._is_discover(data):
                continue
            response = json.dumps({
                "type": "announce",
                "app": DISCOVERY_APP,
                "version": DISCOVERY_VERSION,
                "port": self.http_port,
            }, separators=(",", ":")).encode("utf-8")
            try:
                self._socket.sendto(response, addr)
            except OSError as exc:
                logger.debug(f"LAN discovery response failed for {addr}: {exc}")

    @staticmethod
    def _is_discover(data: bytes) -> bool:
        try:
            payload = json.loads(data.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return False
        return (
            isinstance(payload, dict)
            and payload.get("type") == "discover"
            and payload.get("app") == DISCOVERY_APP
        )
