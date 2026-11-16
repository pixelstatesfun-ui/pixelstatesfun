import { Client, Events, GatewayIntentBits } from 'discord.js';
import { DISCORD_BOT_TOKEN } from './config.js';

let client;
let startPromise;

export function startDiscordBot() {
  if (startPromise) {
    return startPromise;
  }
  if (!DISCORD_BOT_TOKEN) {
    console.info(
      'Discord bot is disabled: DISCORD_BOT_TOKEN is not configured.',
    );
    return Promise.resolve(false);
  }

  client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });
  client.once(Events.ClientReady, (readyClient) => {
    console.info(`Discord bot online as ${readyClient.user.tag}.`);
  });
  client.on(Events.Error, (error) => {
    console.error(`Discord bot gateway error: ${error.message}`);
  });
  client.on(Events.ShardDisconnect, (closeEvent, shardId) => {
    console.warn(
      `Discord bot shard ${shardId} disconnected (code ${closeEvent.code}).`,
    );
  });

  startPromise = client.login(DISCORD_BOT_TOKEN)
    .then(() => true)
    .catch((error) => {
      console.error(`Discord bot failed to log in: ${error.message}`);
      client.destroy();
      client = null;
      startPromise = null;
      return false;
    });
  return startPromise;
}
