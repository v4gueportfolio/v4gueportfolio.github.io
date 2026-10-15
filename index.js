const express = require('express');
const { 
    Client, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    StringSelectMenuOptionBuilder 
} = require('discord.js');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
app.use(express.json());

const JSON_PATH = path.join(__dirname, 'users.json');
const WORKINK_BASE = process.env.WORKINK_LINK || "https://work.ink/your-link-here";
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || "https://key-system-7mt3.onrender.com";

// Helper Functions for activeKeys storage only
function loadData() {
    try {
        if (!fs.existsSync(JSON_PATH)) {
            fs.writeFileSync(JSON_PATH, JSON.stringify({ activeKeys: {} }, null, 2));
        }
        const data = fs.readFileSync(JSON_PATH, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error("Error loading users.json:", err);
        return { activeKeys: {} };
    }
}

function saveData(data) {
    try {
        fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("Error saving users.json:", err);
    }
}

// -------------------------------------------------------------
// 1. DISCORD BOT SETUP
// -------------------------------------------------------------
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
    new SlashCommandBuilder()
        .setName('getkey')
        .setDescription('Select key duration and get your link')
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(
            Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
            { body: commands }
        );
        console.log('Successfully registered /getkey!');
    } catch (error) {
        console.error('Failed to register commands:', error);
    }
});

// Dropdown Menu Handler
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand() && interaction.commandName === 'getkey') {
        const durationSelect = new StringSelectMenuBuilder()
            .setCustomId('select_key_duration')
            .setPlaceholder('Choose your key duration...')
            .addOptions(
                new StringSelectMenuOptionBuilder().setLabel('12 Hours').setValue('12'),
                new StringSelectMenuOptionBuilder().setLabel('24 Hours').setValue('24'),
                new StringSelectMenuOptionBuilder().setLabel('48 Hours').setValue('48'),
                new StringSelectMenuOptionBuilder().setLabel('72 Hours').setValue('72')
            );

        const row = new ActionRowBuilder().addComponents(durationSelect);

        await interaction.reply({
            content: '🔑 **Select your key duration below:**',
            components: [row],
            ephemeral: true 
        });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'select_key_duration') {
        const hours = interaction.values[0];
        const discordId = interaction.user.id;

        // Directly use Work.ink's custom parameter to pass the Discord ID and hours
        const targetLink = `${WORKINK_BASE}?custom=${discordId}&hours=${hours}`;

        await interaction.update({
            content: `⏳ **Duration:** ${hours} Hours\n\n👉 **Get your key here:**\n${targetLink}`,
            components: [],
            ephemeral: true
        });
    }
});

// -------------------------------------------------------------
// 2. CLAIM KEY ENDPOINT
// -------------------------------------------------------------
app.get('/claim-key', (req, res) => {
    // Work.ink passes back the custom discordId
    const discordId = req.query.custom || req.query.subid;
    const hours = parseInt(req.query.hours) || 24;

    if (!discordId) {
        return res.status(400).send(`
            <div style="font-family: sans-serif; text-align: center; margin-top: 60px;">
                <h2 style="color: #ff4757;">⚠️ Missing User ID</h2>
                <p>Please open the link directly from Discord!</p>
            </div>
        `);
    }

    const db = loadData();

    // Generate final key instantly upon link completion
    const randomHash = crypto.randomBytes(11).toString('hex') + crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
    const formattedKey = `LVH_Key=${randomHash}`;
    const expiresAt = Date.now() + (hours * 60 * 60 * 1000);

    db.activeKeys[formattedKey] = { discordId, expiresAt };
    saveData(db);

    client.users.fetch(discordId).then(user => {
        user.send(`🎉 **Key Generated!** Here is your **${hours}-Hour** key:\n\`\`\`text\n${formattedKey}\n\`\`\``);
    }).catch(err => console.error(`DM failure for ${discordId}:`, err));

    res.send(`
        <div style="font-family: sans-serif; text-align: center; margin-top: 60px;">
            <h1 style="color: #2ed573;">🎉 Key Generated Successfully!</h1>
            <p>Check your Discord DMs for your key!</p>
        </div>
    `);
});

// -------------------------------------------------------------
// 3. ROBLOX SCRIPT VALIDATION
// -------------------------------------------------------------
app.get('/validate-key', (req, res) => {
    const { key } = req.query;
    const db = loadData();

    if (!key || !db.activeKeys[key]) {
        return res.json({ valid: false, message: "Invalid key." });
    }

    const keyData = db.activeKeys[key];

    if (Date.now() > keyData.expiresAt) {
        delete db.activeKeys[key];
        saveData(db);
        return res.json({ valid: false, message: "Key has expired." });
    }

    return res.json({ valid: true, message: "Access granted!" });
});

// -------------------------------------------------------------
// 4. SERVER START & KEEP-ALIVE
// -------------------------------------------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

setInterval(() => {
    https.get(RENDER_URL, (res) => {}).on('error', (err) => {});
}, 10 * 60 * 1000);

client.login(process.env.DISCORD_TOKEN);
