import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { PayloadWorkerSchema } from '../schemas/worker/payload.schema';
import { SessionSchema } from '../schemas/worker/session.schema';

@Injectable()
export class WorkerGateway implements OnModuleInit {
  private readonly logger = new Logger(WorkerGateway.name);
  private ws: WebSocket;
  private connections: { [session: string]: WebSocket } = {};

  constructor() {

  }
  onModuleInit() {
    this.connect();
  }

  private connect() {
    this.ws = new WebSocket(`ws://localhost:5000`);

    this.ws.on('open', () => {
      this.logger.log('WebSocket соединение открыто');
    });

    this.ws.on('close', () => {
      this.logger.warn('WebSocket соединение закрыто, переподключение...');
      setTimeout(() => this.connect(), 5000);
    });

    this.ws.on('error', (error) => {
      this.logger.error(`Ошибка WebSocket: ${error.message}`);
    });
  }

  /**
   * 
   * @param payload Данные
   * @returns возвращает промис с ответом от координатора
   */
  async handlerNewSession(payload: PayloadWorkerSchema) {
    console.log(payload)
    const { error } = PayloadWorkerSchema.validate(payload)
    if (error) {
      this.logger.error(error)
      return
    }
    const { knobs, trace_id, station } = payload;
    return this.send('new_session', this.ws, { knobs, station, trace_id }, 'session_created');
  }

  /**
   * 
   * @param payload Данные
   * @returns возвращает промис с ответом от координатора
   */
  async handlerUpdateSession(payload: PayloadWorkerSchema) {
    const { error } = PayloadWorkerSchema.validate(payload)
    if (error) {
      this.logger.error(error)
      return
    }
    const { knobs, session_id, trace_id, station } = payload;
    const ws = this.connections[session_id];
    return this.send('update', ws, { knobs, station, trace_id, session_id }, 'status');
  }

  /**
   * Метод для открытия соединения по конкретной сессии. Скорее всего этот метод можно объединить с методом connect()
   * @param session_id id сессии 
   * @returns 
   */
  public async handlerConnectWithSession(session_id: string) {
    const { error } = SessionSchema.validate(session_id)
    if (error) {
      this.logger.error(error)
      return
    }
    if (this.connections[session_id] && this.connections[session_id].readyState === WebSocket.OPEN) {
      this.logger.warn(`Соединение уже установлено для сессии: ${session_id}`);
      return;
    }

    const ws = new WebSocket(`ws://localhost:5000/${session_id}`);

    ws.on('open', () => {
      this.logger.log(`Connected to WebSocket server with session: ${session_id}`);
      this.connections[session_id] = ws;
    });

    ws.on('close', () => {
      this.logger.warn(`WebSocket соединение закрыто (session: ${session_id})`);
      delete this.connections[session_id];
    });

    ws.on('error', (error) => {
      this.logger.error(`Ошибка WebSocket (session: ${session_id}): ${error.message}`);
    });

  }

  /**
   * Метод для закрытия соединения по конкретной сессии
   * @param session_id id сессии
   */
  public async handlerCloseSessionConnection(session_id: string) {
    const { error } = SessionSchema.validate(session_id)
    if (error) {
      this.logger.error(error)
      return
    }
    const ws = this.connections[session_id];
    if (ws && ws.readyState === WebSocket.OPEN) {
      this.logger.log(`Закрытие соединения для сессии: ${session_id}`);
      ws.close();
    } else {
      this.logger.warn(`Соединение для сессии ${session_id} не найдено или уже закрыто`);
    }
  }

  /**
   * Ping сервера каждые 10 сек
   */
  @Cron('*/10 * * * * *')
  private async handlePing() {
    await this.send('ping', this.ws, {}, 'pong');
  }

  /**
   * Выводит количество активных сессий каждые 60 сек
   */
  @Cron('*/60 * * * * *')
  private async handleSessionLog() {
    this.logger.log('Количество активных сессий: ' + Object.keys(this.connections).length)
  }


  /**
   * Универсальный метод для отправки сообщений координатору. 
   * @param message_type Тип сообщения, ожидаемый координатором
   * @param ws Текущее соединение с координатором (конкретная сессия)
   * @param payload Данные
   * @param expectedMessageType Тип сообщения, по которому будет прослушиваться ответ от координатора
   * @returns Возвращает промис с ответом от координатора
   */
  private async send(
    message_type: string,
    ws: WebSocket,
    payload?: any,
    expectedMessageType?: string
  ): Promise<any> {
    if (ws.readyState === WebSocket.OPEN) {
      return new Promise((resolve, reject) => {
        const uid = uuidv4();

        // Функция обработчика сообщений
        const messageHandler = (message: any) => {
          try {
            const parsedMessage = JSON.parse(message.toString());
            if (parsedMessage.message_type === expectedMessageType &&
              parsedMessage.payload.uid === uid) {
              this.logger.log('Получено сообщение:', parsedMessage)
              ws.off('message', messageHandler); // Удаление обработчика после получения ответа
              resolve(parsedMessage);
            }
          } catch (error) {
            this.logger.error('Ошибка обработки сообщения:', error)
            ws.off('message', messageHandler);
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

  /**
   * Метод для приема аудиочанков
   * @param session_id id сессии
   */
  async *receiveAudioStream(session_id: string) {
    const { error } = SessionSchema.validate(session_id)
    if (error) {
      this.logger.error(error)
      return
    }
    // const ws = this.connections[session]; //это нужно раскомментировать чтобы различать сессии!!!!! В данный момент для тестов используется общее подключение к координатору
    const ws = this.ws; // это нужно убрать, this.ws это подключение без разделения по сессиям
    if (!ws) {
      throw new Error(`Не найдено соединение для сессии: ${session_id}`);
    }
    const audioChunks = [];
    ws.on('message', (data) => {
      // Поскольку мы отправляем байты, нужно проверить тип сообщения и сохранить чанки
      if (Buffer.isBuffer(data)) {
        audioChunks.push(data);
        this.logger.log('Аудиочанк получен:', data.length)
      } else {
        this.logger.warn('Получено сообщение не соответсвующее типу Buffer:', data.toString())
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
