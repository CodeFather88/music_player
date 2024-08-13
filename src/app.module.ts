import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SocketModule } from './socket/socket.module';
import { ScheduleModule } from '@nestjs/schedule';
// import { ConfigModule } from './config/config.module';

@Module({
  imports: [SocketModule, ScheduleModule.forRoot()],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
