import * as Joi from 'joi'
import { PayloadSchema } from '../client/payload.schema';
import { SessionSchema } from './session.schema';

export const PayloadWorkerSchema = Joi.object({
    station: Joi.number().integer().required(),
    knobs: Joi.array().items(Joi.number().integer()).length(3).required(),
    session_id: SessionSchema,
    trace_id: Joi.string().required().max(50)
});
export interface PayloadWorkerSchema {
    station: number,
    knobs: number[],
    session_id?: string,
    trace_id: string
}