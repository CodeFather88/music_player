import { Injectable } from "@nestjs/common";
import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, MessageBody, ConnectedSocket } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { WorkerGateway } from './worker.gateway';
import { randomUUID } from 'crypto';

@Injectable()
@WebSocketGateway({ namespace: '/client' })
export class ClientGateway implements OnGatewayConnection, OnGatewayDisconnect {

    private clients: Map<string, { socket: Socket, trace_id: string, session_id?: string }> = new Map();

    constructor(private readonly workerGateway: WorkerGateway) { }

    @WebSocketServer()
    server: Server;

    handleConnection(client: Socket, ...args: any[]): void {
        const trace_id = randomUUID();
        console.log(`Client connected: ${client.id} with trace_id: ${trace_id}`);

        this.clients.set(client.id, {
            socket: client,
            trace_id,
            session_id: null
        });
    }

    handleDisconnect(client: Socket): void {
        const clientInfo = this.clients.get(client.id);
        if (clientInfo) {
            console.log(`Client disconnected: ${client.id} with trace_id: ${clientInfo.trace_id} and session: ${clientInfo.session_id}`);
            this.clients.delete(client.id);
        } else {
            console.error(`Client info not found for disconnected client: ${client.id}`);
        }
    }


    @SubscribeMessage('new_session')
    async handleNewSession(@MessageBody() data: any, @ConnectedSocket() client: Socket) {
        const { station, knobs } = data.payload;
        const clientInfo = this.clients.get(client.id);
        if (clientInfo.session_id) {
            // await this.workerGateway.handlerCloseSession(clientInfo.session_id)
            clientInfo.session_id = null
        }
        const result = await this.workerGateway.handlerNewSession({ knobs, station, trace_id: clientInfo.trace_id })
        clientInfo.session_id = result.payload.session_id;
        console.log(clientInfo)
        client.emit('new_session', { result: result.payload.session_id })

    }



}
