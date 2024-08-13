import * as Joi from 'joi'

export const PayloadSchema = Joi.object({
    station: Joi.number().integer().required(),
    knobs: Joi.array().items(Joi.number().integer()).length(3).required()
});
export interface PayloadSchema {
    station: number,
    knobs: number[];
}