import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as WebSocket from 'ws';

@Injectable()
export class WorkerGateway implements OnModuleInit {
  private readonly logger = new Logger(WorkerGateway.name);
  private ws: WebSocket;
  private connections: { [session: string]: WebSocket } = {};

  constructor() {
    setInterval(() => {
      console.log(this.connections)
    }, 10000)
  }
  onModuleInit() {
    this.connect();
  }

  private connect(session = '') {
    this.ws = new WebSocket(`ws://localhost:5000/${session}`);

    this.ws.on('open', () => {
      this.logger.log('Connected to WebSocket server');
    });

    this.ws.on('close', () => {
      this.logger.warn('WebSocket соединение закрыто, переподключение...');
      setTimeout(() => this.connect(), 5000);
    });

    this.ws.on('error', (error) => {
      this.logger.error(`Ошибка WebSocket: ${error.message}`);
    });
  }

  async handlerNewSession(payload: any): Promise<any> {
    const { knobs, trace_id, station } = payload;

    return new Promise((resolve, reject) => {
      this.ws.on('message', (message) => {
        try {
          const parsedMessage = JSON.parse(message.toString());
          if (parsedMessage.message_type == 'session_created' && parsedMessage.payload.trace_id == payload.trace_id) {
            console.log('Received message:', parsedMessage);
            resolve(parsedMessage);
          }

        } catch (error) {
          console.error('Error parsing message:', error);
          reject(error);
        }
      });

      this.send('new_session', { knobs, station, trace_id });
    });
  }

  public handlerConnectWithSession(session: string) {
    if (this.connections[session] && this.connections[session].readyState === WebSocket.OPEN) {
      this.logger.warn(`Соединение уже установлено для сессии: ${session}`);
      return;
    }

    const ws = new WebSocket(`ws://localhost:5000/${session}`);

    ws.on('open', () => {
      this.logger.log(`Connected to WebSocket server with session: ${session}`);
      this.connections[session] = ws; // Сохранение соединения
    });

    ws.on('close', () => {
      this.logger.warn(`WebSocket соединение закрыто (session: ${session})`);
      delete this.connections[session]; // Удаление закрытого соединения
    });

    ws.on('error', (error) => {
      this.logger.error(`Ошибка WebSocket (session: ${session}): ${error.message}`);
    });
  }

  public handlerCloseSessionConnection(session: string) {
    const ws = this.connections[session];
    if (ws && ws.readyState === WebSocket.OPEN) {
      this.logger.log(`Закрытие соединения для сессии: ${session}`);
      ws.close();
    } else {
      this.logger.warn(`Соединение для сессии ${session} не найдено или уже закрыто`);
    }
  }

  private async send(message_type: string, payload?: any) {
    if (this.ws.readyState === WebSocket.OPEN) {
      try {
        const message = JSON.stringify({
          message_type,

          payload

        });
        this.logger.log(`Отправка сообщения: ${message}`);
        this.ws.send(message);
      } catch (error) {
        this.logger.error(`Ошибка при отправке сообщения: ${error.message}`);
      }
    } else {
      this.logger.warn('WebSocket соединение не открыто, сообщение не отправлено');
    }
  }
}
