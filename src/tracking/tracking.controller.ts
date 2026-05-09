import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  TrackingSnapshotPayloadDto,
  TrackingStartSessionPayloadDto,
  TrackingStopSessionPayloadDto,
  TrackingUpdateLocationPayloadDto,
} from '@rideglory/contracts';
import { TrackingService } from './tracking.service';

@Controller()
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @MessagePattern('trackingStartSession')
  startSession(@Payload() payload: TrackingStartSessionPayloadDto) {
    return this.trackingService.startSession(payload);
  }

  @MessagePattern('trackingStopSession')
  stopSession(@Payload() payload: TrackingStopSessionPayloadDto) {
    return this.trackingService.stopSession(payload);
  }

  @MessagePattern('trackingSnapshot')
  snapshot(@Payload() payload: TrackingSnapshotPayloadDto) {
    return this.trackingService.snapshot(payload);
  }

  @MessagePattern('trackingUpdateLocation')
  updateLocation(@Payload() payload: TrackingUpdateLocationPayloadDto) {
    return this.trackingService.updateLocation(payload);
  }
}
