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

process.on('unhandledRejection', err => console.error('Unhandled rejection:', err));
process.on('uncaughtException', err => console.error('Uncaught exception:', err));

const app = express();
app.use(express.json());

const JSON_PATH = path.join(__dirname, 'users.json');
// Plain Work.ink link whose DESTINATION is: https://YOUR-APP.onrender.com/claim-key?token={TOKEN}
const WORKINK_BASE = process.env.WORKINK_LINK || "https://work.ink/35gR/lvh-key-system";
const RENDER_URL = (process.env.RENDER_EXTERNAL_URL || "https://key-system-7mt3.onrender.com").replace(/\/$/, '');

function loadData() {
    try {
        if (!fs.existsSync(JSON_PATH)) {
            fs.writeFileSync(JSON_PATH, JSON.stringify({ progress: {}, activeKeys: {}, usedTokens: {} }, null, 2));
        }
        const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
        if (!data.progress) data.progress = {};
        if (!data.activeKeys) data.activeKeys = {};
        if (!data.usedTokens) data.usedTokens = {};
        return data;
    } catch (err) {
        console.error("Error loading users.json:", err);
        return { progress: {}, activeKeys: {}, usedTokens: {} };
    }
}

function saveData(data) {
    try {
        fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("Error saving users.json:", err);
    }
}

function getCookie(req, name) {
    const found = (req.headers.cookie || '')
        .split(';')
        .map(s => s.trim())
        .find(s => s.startsWith(name + '='));
    return found ? decodeURIComponent(found.slice(name.length + 1)) : null;
}

function findBySid(db, sid) {
    if (!sid) return null;
    for (const [discordId, p] of Object.entries(db.progress)) {
        if (p.sid === sid) return { discordId, progress: p };
    }
    return null;
}

function page(title, body, color = '#2ed573') {
    return `
    <div style="font-family: sans-serif; text-align: center; margin-top: 100px; padding: 0 20px;">
        <h1 style="color: ${color};">${title}</h1>
        ${body}
    </div>`;
}

// ---------------------------------------------------------------
// DISCORD BOT
// ---------------------------------------------------------------
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
    new SlashCommandBuilder()
        .setName('getkey')
        .setDescription('Select key duration and complete checkpoints')
].map(c => c.toJSON());

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

client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isChatInputCommand() && interaction.commandName === 'getkey') {
            await interaction.deferReply({ ephemeral: true });

            const durationSelect = new StringSelectMenuBuilder()
                .setCustomId('select_key_duration')
                .setPlaceholder('Choose your key duration...')
                .addOptions(
                    new StringSelectMenuOptionBuilder().setLabel('12 Hours').setDescription('1 Checkpoint').setValue('12_1'),
                    new StringSelectMenuOptionBuilder().setLabel('24 Hours').setDescription('2 Checkpoints').setValue('24_2'),
                    new StringSelectMenuOptionBuilder().setLabel('48 Hours').setDescription('3 Checkpoints').setValue('48_3'),
                    new StringSelectMenuOptionBuilder().setLabel('72 Hours').setDescription('4 Checkpoints').setValue('72_4')
                );

            await interaction.editReply({
                content: '🔑 **Select your key duration below:**',
                components: [new ActionRowBuilder().addComponents(durationSelect)]
            });
            return;
        }

        if (interaction.isStringSelectMenu() && interaction.customId === 'select_key_duration') {
            const [hours, requiredSteps] = interaction.values[0].split('_').map(Number);
            const discordId = interaction.user.id;
            const sid = crypto.randomBytes(16).toString('hex');

            const db = loadData();
            db.progress[discordId] = { sid, current: 0, required: requiredSteps, hours };
            saveData(db);

            const startLink = `${RENDER_URL}/start?sid=${sid}`;

            await interaction.update({
                content: `⏳ **Duration:** ${hours} Hours (${requiredSteps} Checkpoints)\n\n👉 **Checkpoint 1/${requiredSteps}:**\n${startLink}\n\n⚠️ Open every link in the **same browser**.`,
                components: []
            });
        }
    } catch (err) {
        console.error('Interaction error:', err);
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ content: '❌ Something went wrong. Try /getkey again.', components: [] });
            } else {
                await interaction.reply({ content: '❌ Something went wrong. Try /getkey again.', ephemeral: true });
            }
        } catch (_) {}
    }
});

// ---------------------------------------------------------------
// /start -> remembers the user in a cookie, then goes to Work.ink
// ---------------------------------------------------------------
app.get('/start', (req, res) => {
    const sid = req.query.sid;
    const db = loadData();

    if (!findBySid(db, sid)) {
        return res.status(404).send(page('⚠️ Link expired', '<p>Run /getkey in Discord again.</p>', '#ffa500'));
    }

    res.cookie('sid', sid, { maxAge: 60 * 60 * 1000, httpOnly: true, sameSite: 'lax' });
    res.redirect(WORKINK_BASE);
});

// ---------------------------------------------------------------
// /claim-key?token=... -> Work.ink sends the user here when done.
// Completed -> next step link, or the key after the last step.
// ---------------------------------------------------------------
app.get('/claim-key', async (req, res) => {
    try {
        const token = req.query.token;
        if (!token) {
            return res.status(400).send(page('⚠️ Missing token', '<p>Complete the Work.ink link first.</p>', '#ffa500'));
        }

        const db = loadData();
        const found = findBySid(db, getCookie(req, 'sid'));

        if (!found) {
            return res.status(404).send(page(
                '⚠️ No active progress found',
                '<p>Run /getkey in Discord and open the link in the same browser.</p>',
                '#ffa500'
            ));
        }

        if (db.usedTokens[token]) {
            return res.status(400).send(page('⚠️ Token already used', '<p>Complete the checkpoint again.</p>', '#ff4757'));
        }

        const verifyRes = await fetch(`https://work.ink/_api/v2/token/isValid/${encodeURIComponent(token)}?deleteToken=1`);
        const verify = await verifyRes.json();

        if (!verify.valid) {
            return res.status(400).send(page('❌ Invalid token', '<p>Complete the Work.ink steps properly.</p>', '#ff4757'));
        }

        db.usedTokens[token] = Date.now();

        const { discordId, progress } = found;
        progress.current += 1;

        let dmMessage;
        let pageBody;

        if (progress.current < progress.required) {
            saveData(db);
            const nextLink = `${RENDER_URL}/start?sid=${progress.sid}`;
            dmMessage = `✅ **Checkpoint ${progress.current}/${progress.required} Completed!**\n\n👉 **Next Checkpoint:**\n${nextLink}`;
            pageBody = `
                <p style="font-size: 18px;">Checkpoint ${progress.current}/${progress.required} done.</p>
                <p><a href="${nextLink}" style="font-size: 20px;">👉 Continue to next checkpoint</a></p>`;
        } else {
            delete db.progress[discordId];

            const randomHash =
                crypto.randomBytes(11).toString('hex') +
                crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
            const formattedKey = `LVH_Key=${randomHash}`;
            const expiresAt = Date.now() + (progress.hours * 60 * 60 * 1000);

            db.activeKeys[formattedKey] = { discordId, expiresAt };
            saveData(db);

            dmMessage = `🎉 **All Checkpoints Cleared!** Here is your **${progress.hours}-Hour** key:\n\`\`\`text\n${formattedKey}\n\`\`\``;
            pageBody = `
                <p style="font-size: 18px;">Here is your ${progress.hours}-hour key:</p>
                <p><code style="font-size: 18px; background: #eee; padding: 8px 12px; border-radius: 6px;">${formattedKey}</code></p>`;
        }

        try {
            const user = await client.users.fetch(discordId);
            await user.send(dmMessage);
        } catch (err) {
            console.error('DM error:', err.message);
        }

        res.send(page('✅ Checkpoint Complete!', pageBody));
    } catch (err) {
        console.error('claim-key error:', err);
        res.status(500).send(page('❌ Server error', '<p>Try again in a moment.</p>', '#ff4757'));
    }
});

// ---------------------------------------------------------------
// Key validation (for the Roblox side, later)
// ---------------------------------------------------------------
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

app.get('/', (req, res) => res.send('OK'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

setInterval(() => {
    https.get(RENDER_URL, () => {}).on('error', () => {});
}, 10 * 60 * 1000);

client.login(process.env.DISCORD_TOKEN);
