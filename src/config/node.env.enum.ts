/**
 * App environment mode enum.
 * Values must match the prefixes/postfixes of .env.${NODE_ENV} and config.${NODE_ENV}.json files.
 */
export enum NodeEnv {
    Prod = 'prod',
    Dev = 'dev',
    Test = 'test',
}
