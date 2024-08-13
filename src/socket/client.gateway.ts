import { Injectable } from "@nestjs/common";
import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, MessageBody, ConnectedSocket } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { WorkerGateway } from './worker.gateway';
import { randomUUID } from 'crypto';

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
            console.log(`Client disconnected: ${client.id} and session: ${clientInfo.session_id}`);
            if (clientInfo.session_id) {

                await this.workerGateway.handlerCloseSessionConnection(clientInfo.session_id)
            }
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
            await this.workerGateway.handlerCloseSessionConnection(clientInfo.session_id)
            clientInfo.session_id = null
        }
        const result = await this.workerGateway.handlerNewSession({ knobs, station, trace_id: client.id })
        clientInfo.session_id = result.payload.session_id;
        await this.workerGateway.handlerConnectWithSession(clientInfo.session_id)
        client.emit('new_session', { result: result.payload.session_id })

    }



}
