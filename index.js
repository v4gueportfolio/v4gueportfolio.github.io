const express = require('express');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// In-memory key store (Use a DB in production)
const activeKeys = new Map();

// -------------------------------------------------------------
// 1. DISCORD BOT SETUP & AUTOMATIC COMMAND REGISTRATION
// -------------------------------------------------------------
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
    new SlashCommandBuilder()
        .setName('getkey')
        .setDescription('Generates a Work.ink link to obtain your script key')
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    // AUTO-REGISTER COMMANDS INSTANTLY TO YOUR SERVER
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        console.log('Registering slash commands...');
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands }
        );
        console.log('Successfully registered /getkey!');
    } catch (error) {
        console.error('Failed to register commands:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'getkey') {
        const discordId = interaction.user.id;
        
        // Replace with your Work.ink link
        const workinkBase = process.env.WORKINK_LINK || "https://work.ink/your-link-here";
        const targetLink = `${workinkBase}?custom=${discordId}`;

        await interaction.reply({
            content: `🔑 **Your Custom Key Link:**\n${targetLink}\n\n*Complete the link to automatically receive your key in this server!*`,
            ephemeral: true
        });
    }
});

// -------------------------------------------------------------
// 2. WORK.INK WEBHOOK (AUTOMATIC KEY GENERATION)
// -------------------------------------------------------------
app.post('/workink-webhook', (req, res) => {
    const { custom } = req.body;

    if (!custom) {
        return res.status(400).send('No custom ID provided.');
    }

    // Generate unique key and lock to Discord ID
    const newKey = `KEY_${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
    activeKeys.set(newKey, { discordId: custom, createdAt: Date.now() });

    console.log(`Key generated for Discord ID ${custom}:${newKey}`);

    // Optionally DM the user on Discord
    client.users.fetch(custom).then(user => {
        user.send(`🎉 **Link completed!** Here is your script key:\n\`${newKey}\``);
    }).catch(() => console.log(`Could not DM user ${custom}`));

    res.status(200).send('Webhook processed');
});

// -------------------------------------------------------------
// 3. ROBLOX SCRIPT VALIDATION ENDPOINT
// -------------------------------------------------------------
app.get('/validate-key', (req, res) => {
    const { key } = req.query;

    if (activeKeys.has(key)) {
        return res.json({ valid: true, message: "Access granted!" });
    }

    return res.json({ valid: false, message: "Invalid or expired key." });
});

// -------------------------------------------------------------
// 4. SERVER STARTUP
// -------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

client.login(process.env.DISCORD_TOKEN);
