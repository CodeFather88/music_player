import * as Joi from 'joi'
import { PayloadSchema } from './payload.schema';

export const UpdateSessionSchema = Joi.object({
    payload: PayloadSchema
});
export interface UpdateSessionSchema {
    payload: PayloadSchema
}