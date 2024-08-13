import { Module } from '@nestjs/common';
import { WorkerGateway } from './worker.gateway';
import { ClientGateway } from './client.gateway'; 

@Module({
  providers: [
    WorkerGateway,
    ClientGateway
  ]
})
export class SocketModule { }
