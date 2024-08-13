import { Module } from '@nestjs/common';
// import { TestGateway } from './test.gateway';
import { WorkerGateway } from './worker.gateway';
import { ClientGateway } from './client.gateway'; 

@Module({
  providers: [
    WorkerGateway,
    ClientGateway
    // TestGateway
  ]
})
export class SocketModule { }
