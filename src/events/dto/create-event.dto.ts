import { EventDifficulty, EventState, EventType } from "@prisma/client";
import { Type } from "class-transformer";
import { IsArray, IsDate, IsEnum, IsNumber, IsOptional, IsPositive } from "class-validator";

import { IsString } from "class-validator";

export class CreateEventDto {
    @IsString()
    ownerId!: string;
    @IsString()
    name!: string;
    @IsString()
    description!: string;
    @IsString()
    city!: string;
    @Type(() => Date)
    @IsDate()
    startDate!: Date;
    @Type(() => Date)
    @IsDate()
    endDate!: Date;
    @IsEnum(EventDifficulty)
    difficulty!: EventDifficulty;
    @IsString()
    meetingPoint!: string;
    @IsString()
    destination!: string;
    @Type(() => Date)
    @IsDate()
    meetingTime!: Date;
    @IsEnum(EventType)
    eventType!: EventType;
    @IsArray()
    @IsString({ each: true })
    allowedBrands!: string[];
    @IsOptional()
    @IsNumber()
    @IsPositive()
    price?: number;
    @IsOptional()
    @IsString()
    imageUrl?: string;
    @IsEnum(EventState)
    @IsOptional()
    state: EventState = EventState.scheduled;
}
