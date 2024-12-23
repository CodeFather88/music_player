import { Injectable, Session } from "@nestjs/common";
import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, MessageBody, ConnectedSocket } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { WorkerGateway } from './worker.gateway';
import { randomUUID } from 'crypto';
import { NewSessionSchema } from "../schemas/client/new-session.schema";
import { UpdateSessionSchema } from "../schemas/client/update-session.schema";

@Injectable()
@WebSocketGateway({ namespace: '/client' })
export class ClientGateway implements OnGatewayConnection, OnGatewayDisconnect {

    private clients: Map<string, { socket: Socket, session_id?: string }> = new Map();

    constructor(private readonly workerGateway: WorkerGateway) {

    }

    @WebSocketServer()
    server: Server;

    handleConnection(client: Socket, ...args: any[]): void {
        console.log(`Client connected: ${client.id}`);

        this.clients.set(client.id, {
            socket: client,
            session_id: null
        });
    }

    async handleDisconnect(client: Socket) {
        const clientInfo = this.clients.get(client.id);
        if (clientInfo) {
            console.log(`Клиент отключен: ${client.id} сессия: ${clientInfo.session_id}`);
            if (clientInfo.session_id) {
                await this.workerGateway.handlerCloseSessionConnection(clientInfo.session_id)
            }
            this.clients.delete(client.id);
        } else {
            console.error(`Client info не найден для отключенного client: ${client.id}`);
        }
    }


    @SubscribeMessage('new_session')
    async handleNewSession(@MessageBody() data: NewSessionSchema, @ConnectedSocket() client: Socket) {
        const { error } = NewSessionSchema.validate(data);
        if (error) {
            client.emit('error', { message: "validation error" })
        }
        const { station, knobs } = data.payload;
        const clientInfo = this.clients.get(client.id);
        if (clientInfo.session_id) {
            await this.workerGateway.handlerCloseSessionConnection(clientInfo.session_id)
            clientInfo.session_id = null
        }
        const result = await this.workerGateway.handlerNewSession({ knobs, station, trace_id: client.id })
        clientInfo.session_id = result.payload.session_id;
        await this.workerGateway.handlerConnectWithSession(clientInfo.session_id).then(() => {

            client.emit('new_session', result.payload)
        })
    }

    @SubscribeMessage('update_session')
    async handleUpdateSession(@MessageBody() data: UpdateSessionSchema, @ConnectedSocket() client: Socket) {
        const { error } = UpdateSessionSchema.validate(data);
        if (error) {
            client.emit('error', { message: "validation error" })
        }
        const { station, knobs } = data.payload;
        const clientInfo = this.clients.get(client.id);
        const { session_id } = clientInfo
        if (!session_id) {
            return
        }
        const result = await this.workerGateway.handlerUpdateSession({ knobs, station, session_id, trace_id: client.id })
        client.emit('update_session', result.payload)

    }

    @SubscribeMessage('chunks')
    async handleGetChunks(@ConnectedSocket() client: Socket) {
        const clientInfo = this.clients.get(client.id);

        if (!clientInfo.session_id) {
            console.error('Не найден session_id для данного клиента.');
            return;
        }

        console.log('Starting to receive audio chunks for session:', clientInfo.session_id);

        for await (const chunk of this.workerGateway.receiveAudioStream(clientInfo.session_id)) {
            console.log(`Received audio chunk: ${chunk.length} bytes`);
            client.emit('chunks', chunk);
        }
    }


}
