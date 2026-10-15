const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');

// --- 1. EXPRESS WEB SERVER (Work.ink & Roblox Check) ---
const app = express();
app.use(express.json());

const db = {}; // Stores keys (use MongoDB for real setup)

app.post('/workink-webhook', (req, res) => {
    const { custom, completed } = req.body;
    if (completed && custom) {
        const generatedKey = "KEY_" + Math.random().toString(36).substring(2, 10).toUpperCase();
        db[generatedKey] = { discordId: custom, hwid: null, expires: Date.now() + 86400000 };
        console.log(`Generated ${generatedKey} for user ${custom}`);
    }
    res.sendStatus(200);
});

app.post('/verify', (req, res) => {
    const { key, hwid } = req.body;
    const data = db[key];
    if (!data || Date.now() > data.expires) return res.json({ success: false, message: "Invalid/expired key!" });
    if (!data.hwid) data.hwid = hwid;
    else if (data.hwid !== hwid) return res.json({ success: false, message: "HWID mismatch!" });
    res.json({ success: true, message: "Access granted!" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// --- 2. DISCORD BOT ---
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), {
            body: [new SlashCommandBuilder().setName('getkey').toJSON()],
        });
        console.log('Slash commands registered!');
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === 'getkey') {
        const discordId = interaction.user.id;
        // REPLACE WITH UR ACTUAL WORK.INK LINK BASE
        const targetLink = `https://work.ink/YOUR_ID/12345?custom=${discordId}`;
        await interaction.reply({ content: `Complete this link to get your key: ${targetLink}`, ephemeral: true });
    }
});

client.login(process.env.DISCORD_TOKEN);
