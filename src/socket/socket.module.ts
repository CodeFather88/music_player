import { Module } from '@nestjs/common';
import { WorkerGateway } from './gateways/worker.gateway';
import { ClientGateway } from './gateways/client.gateway'; 

@Module({
  providers: [
    WorkerGateway,
    ClientGateway
  ]
})
export class SocketModule { }
