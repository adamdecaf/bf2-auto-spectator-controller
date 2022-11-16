import * as path from 'path';

export default abstract class Config {
    static readonly ROOT_DIR: string = path.join(__dirname, '..');
    static readonly LISTEN_PORT: number = Number(process.env.PORT || 8181);
    static readonly LOG_LEVEL: string = process.env.LOG_LEVEL || 'info';
    static readonly SPECTATOR_CHANNEL: string = process.env.SPECTATOR_CHANNEL || 'BF2tv';
    static readonly TWITCH_CLIENT_ID?: string = process.env.TWITCH_CLIENT_ID;
    static readonly TWITCH_CLIENT_SECRET?: string = process.env.TWITCH_CLIENT_SECRET;
    static readonly CHATBOT_USERNAME: string = process.env.CHATBOT_USERNAME || '';
    static readonly CHATBOT_OAUTH_ACCESS_TOKEN: string = process.env.CHATBOT_OAUTH_ACCESS_TOKEN || '';
    static readonly CHATBOT_OAUTH_REFRESH_TOKEN?: string = process.env.CHATBOT_OAUTH_REFRESH_TOKEN;
    static readonly SPECTATOR_NAME: string = process.env.SPECTATOR_NAME || 'twitch.tv/BF2tv';
    static readonly DISABLED_COMMANDS: string[] = process.env.DISABLED_COMMANDS?.split(' ') || [];
}
