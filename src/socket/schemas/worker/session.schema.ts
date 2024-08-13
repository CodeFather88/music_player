import * as Joi from 'joi'

export const SessionSchema = Joi.string().max(120).optional()