import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import * as WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';

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
    return this.send('new_session', this.ws, { knobs, station, trace_id }, 'session_created');
  }

  async handlerUpdateSession(payload: any): Promise<any> {
    const { knobs, session_id, trace_id, station } = payload;
    const ws = this.connections[session_id];
    return this.send('update', ws, { knobs, station, trace_id, session_id }, 'status');
  }

  public async handlerConnectWithSession(session: string) {
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

  public async handlerCloseSessionConnection(session: string) {
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
    const pong = await this.send('ping', this.ws, {}, 'pong');
    console.log(pong)
  }


  private async send(
    message_type: string,
    ws: WebSocket,
    payload?: any,
    expectedMessageType?: string
  ): Promise<any> {
    if (ws.readyState === WebSocket.OPEN) {
      console.log()
      return new Promise((resolve, reject) => {
        const uid = uuidv4();

        // Функция обработчика сообщений
        const messageHandler = (message: any) => {
          try {
            const parsedMessage = JSON.parse(message.toString());
            if (parsedMessage.message_type === expectedMessageType &&
              parsedMessage.payload.uid === uid) {
              console.log('Получено сообщение:', parsedMessage);
              ws.off('message', messageHandler); // Удаление обработчика после получения ответа
              resolve(parsedMessage);
            }
          } catch (error) {
            console.error('Ошибка обработки сообщения:', error);
            ws.off('message', messageHandler); // Удаление обработчика в случае ошибки
            reject(error);
          }
        };

        ws.on('message', messageHandler);

        // Отправка сообщения
        try {
          const message = JSON.stringify({
            message_type,
            payload: { ...payload, uid: uid }
          });
          this.logger.log(`Отправка сообщения: ${message}`);
          ws.send(message);
        } catch (error) {
          this.logger.error(`Ошибка при отправке сообщения: ${error.message}`);
          ws.off('message', messageHandler);
          reject(error);
        }
      });
    } else {
      this.logger.warn('WebSocket соединение не открыто, сообщение не отправлено');
      return Promise.reject(new Error('WebSocket не открыт'));
    }
  }

  // Метод для приема аудиочанков
  async *receiveAudioStream(session) {
    // const ws = this.connections[session]; //это нужно раскомментировать чтобы различать сессии!!!!!
    const ws = this.ws; //а это нужно убрать

    if (!ws) {
      throw new Error(`No connection found for session: ${session}`);
    }

    const audioChunks = [];

    ws.on('message', (data) => {
      // Поскольку мы отправляем байты, нужно проверить тип сообщения и сохранить чанки
      if (Buffer.isBuffer(data)) {
        audioChunks.push(data);
        console.log('Audio chunk received and added to queue:', data.length);
      } else {
        console.log('Non-buffer message received:', data.toString());
      }
    });

    while (true) {
      if (audioChunks.length > 0) {
        yield audioChunks.shift(); // Возвращаем первый аудиочанк
      } else {
        await new Promise((resolve) => setTimeout(resolve, 100)); // Ждем, пока не появятся новые данные
      }
    }
  }




}
