import * as Joi from 'joi'

export const NewSessionSchema = Joi.object({
    payload: Joi.object({
        station: Joi.number().integer().required(),
        knobs: Joi.array().items(Joi.number().integer()).length(3).required()
    }).required()
});
