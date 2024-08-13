import * as Joi from 'joi'
import { PayloadSchema } from './payload.schema';

export const NewSessionSchema = Joi.object({
    payload: PayloadSchema
});
export interface NewSessionSchema {
    payload: PayloadSchema
}