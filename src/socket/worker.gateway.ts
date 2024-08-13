import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import * as WebSocket from 'ws';

@Injectable()
export class WorkerGateway implements OnModuleInit {
  private readonly logger = new Logger(WorkerGateway.name);
  private ws: WebSocket;
  private connections: { [session: string]: WebSocket } = {};

  constructor() {
    setInterval(() => {
      console.log(Object.keys(this.connections).length)
    }, 5000)
  }
  onModuleInit() {
    this.connect();
  }

  private connect() {
    this.ws = new WebSocket(`ws://localhost:5000`);

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
      const messageHandler = (message: any) => {
        try {
          const parsedMessage = JSON.parse(message.toString());
          if (parsedMessage.message_type === 'session_created' && parsedMessage.payload.trace_id === payload.trace_id) {
            console.log('Received message:', parsedMessage);
            this.ws.off('message', messageHandler);
            resolve(parsedMessage);
          }
        } catch (error) {
          console.error('Error parsing message:', error);
          this.ws.off('message', messageHandler);
          reject(error);
        }
      };

      this.ws.on('message', messageHandler);

      this.send('new_session', this.ws, { knobs, station, trace_id });
    });
  }

  async handlerUpdateSession(payload: any): Promise<any> {
    const { knobs, session_id, trace_id, station } = payload;
    const ws = this.connections[session_id];

    return new Promise((resolve, reject) => {
      const messageHandler = (message: any) => {
        try {
          const parsedMessage = JSON.parse(message.toString());
          if (parsedMessage.message_type === 'status' && parsedMessage.payload.trace_id === payload.trace_id) {
            console.log('Received message:', parsedMessage);
            ws.off('message', messageHandler);
            resolve(parsedMessage);
          }
        } catch (error) {
          console.error('Error parsing message:', error);
          ws.off('message', messageHandler);
          reject(error);
        }
      };

      ws.on('message', messageHandler);

      this.send('update', ws, { knobs, station, trace_id });
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
      this.connections[session] = ws;
    });

    ws.on('close', () => {
      this.logger.warn(`WebSocket соединение закрыто (session: ${session})`);
      delete this.connections[session];
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

  /**
   * Ping сервера каждые 10 сек
   */
  @Cron('*/10 * * * * *')
  private async handlePing() {
    const requestId = randomUUID();
    const payload = { requestId };
    await new Promise<void>((resolve, reject) => {
      const messageHandler = (message: any) => {
        try {
          const parsedMessage = JSON.parse(message.toString());
          if (parsedMessage.message_type === 'pong' && parsedMessage.payload.requestId === requestId) {
            console.log('pong');
            this.ws.off('message', messageHandler);
            resolve();
          }
        } catch (error) {
          console.error('Error parsing message:', error);
          this.ws.off('message', messageHandler);
          reject(error);
        }
      };

      this.ws.on('message', messageHandler);

      if (this.ws.readyState === WebSocket.OPEN) {
        this.send('ping', this.ws, payload);
      } else {
        reject(new Error('WebSocket is not open'));
      }
    }).catch(error => {
      console.error('Ping handling failed:', error);
    });
  }

  private async send(message_type: string, ws: WebSocket, payload?: any,) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        const message = JSON.stringify({
          message_type,
          payload

        });
        this.logger.log(`Отправка сообщения: ${message}`);
        ws.send(message);
      } catch (error) {
        this.logger.error(`Ошибка при отправке сообщения: ${error.message}`);
      }
    } else {
      this.logger.warn('WebSocket соединение не открыто, сообщение не отправлено');
    }
  }
}
