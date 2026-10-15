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

const app = express();
app.use(express.json());

// In-Memory Storage
const activeKeys = new Map();         
const activeProgress = new Map();     

const WORKINK_BASE = process.env.WORKINK_LINK || "https://work.ink/your-link-here";

// -------------------------------------------------------------
// 1. DISCORD BOT SETUP
// -------------------------------------------------------------
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
    new SlashCommandBuilder()
        .setName('getkey')
        .setDescription('Select key duration and complete checkpoints')
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        console.log('Registering slash commands...');
        await rest.put(
            Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
            { body: commands }
        );
        console.log('Successfully registered /getkey!');
    } catch (error) {
        console.error('Failed to register commands:', error);
    }
});

// Dropdown & Command Interaction
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand() && interaction.commandName === 'getkey') {
        const durationSelect = new StringSelectMenuBuilder()
            .setCustomId('select_key_duration')
            .setPlaceholder('Choose your key duration...')
            .addOptions(
                new StringSelectMenuOptionBuilder().setLabel('12 Hours').setDescription('1 Checkpoint').setValue('12_1'),
                new StringSelectMenuOptionBuilder().setLabel('24 Hours').setDescription('2 Checkpoints').setValue('24_2'),
                new StringSelectMenuOptionBuilder().setLabel('48 Hours').setDescription('3 Checkpoints').setValue('48_3'),
                new StringSelectMenuOptionBuilder().setLabel('72 Hours').setDescription('4 Checkpoints').setValue('72_4')
            );

        const row = new ActionRowBuilder().addComponents(durationSelect);

        await interaction.reply({
            content: '🔑 **Select your key duration below:**',
            components: [row],
            ephemeral: true 
        });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'select_key_duration') {
        const [hours, requiredSteps] = interaction.values[0].split('_');
        const discordId = interaction.user.id;

        activeProgress.set(discordId, {
            current: 0,
            required: parseInt(requiredSteps),
            hours: parseInt(hours)
        });

        const targetLink = `${WORKINK_BASE}?custom=${discordId}`;

        await interaction.update({
            content: `⏳ **Duration:** ${hours} Hours (${requiredSteps} Checkpoint${requiredSteps > 1 ? 's' : ''})\n\n👉 **Checkpoint 1/${requiredSteps}:**\n${targetLink}\n\n*Complete the link to advance!*`,
            components: [],
            ephemeral: true
        });
    }
});

// -------------------------------------------------------------
// 2. REDIRECT / CLAIM KEY ENDPOINT
// -------------------------------------------------------------
app.get('/claim-key', (req, res) => {
    const discordId = req.query.custom || req.query.subid;

    if (!discordId) {
        return res.send('<h2>Error: No user ID attached. Please generate link via Discord.</h2>');
    }

    const progress = activeProgress.get(discordId) || { current: 0, required: 1, hours: 12 };
    progress.current += 1;

    client.users.fetch(discordId).then(user => {
        if (progress.current < progress.required) {
            activeProgress.set(discordId, progress);
            const targetLink = `${WORKINK_BASE}?custom=${discordId}`;
            user.send(`✅ **Checkpoint ${progress.current}/${progress.required} Completed!**\n\n👉 **Next Checkpoint:**\n${targetLink}`);
        } else {
            activeProgress.delete(discordId);

            const randomHash = crypto.randomBytes(11).toString('hex') + crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
            const formattedKey = `LVH_Key=${randomHash}`;
            const expiresAt = Date.now() + (progress.hours * 60 * 60 * 1000);

            activeKeys.set(formattedKey, { discordId, expiresAt });

            user.send(`🎉 **All Checkpoints Cleared!** Here is your **${progress.hours}-Hour** key:\n\`\`\`text\n${formattedKey}\n\`\`\``);
        }
    }).catch(err => console.error("DM failed:", err));

    res.send('<h1>Success! Check your Discord DMs for your key / next step.</h1>');
});

// -------------------------------------------------------------
// 3. ROBLOX SCRIPT VALIDATION
// -------------------------------------------------------------
app.get('/validate-key', (req, res) => {
    const { key } = req.query;

    if (!key || !activeKeys.has(key)) {
        return res.json({ valid: false, message: "Invalid key." });
    }

    const keyData = activeKeys.get(key);

    if (Date.now() > keyData.expiresAt) {
        activeKeys.delete(key);
        return res.json({ valid: false, message: "Key has expired." });
    }

    return res.json({ valid: true, message: "Access granted!" });
});

// -------------------------------------------------------------
// 4. SERVER START
// -------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));

client.login(process.env.DISCORD_TOKEN);
