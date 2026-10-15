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

// Memory Caches
const activeKeys = new Map();     // Key -> { discordId, expiresAt }
const activeProgress = new Map(); // Discord ID -> { current, required, hours }

// Your Work.ink Link set in Render Environment Variables
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
        // Using client.user.id directly prevents 'undefined' ID issues
        await rest.put(
            Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
            { body: commands }
        );
        console.log('Successfully registered /getkey!');
    } catch (error) {
        console.error('Failed to register commands:', error);
    }
});

// Handle Slash Command & Dropdown Selection
client.on('interactionCreate', async interaction => {
    
    // Slash Command Execution
    if (interaction.isChatInputCommand() && interaction.commandName === 'getkey') {
        const durationSelect = new StringSelectMenuBuilder()
            .setCustomId('select_key_duration')
            .setPlaceholder('Choose your key duration...')
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('12 Hours')
                    .setDescription('Requires 1 Checkpoint step')
                    .setValue('12_1'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('24 Hours')
                    .setDescription('Requires 2 Checkpoint steps')
                    .setValue('24_2'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('48 Hours')
                    .setDescription('Requires 3 Checkpoint steps')
                    .setValue('48_3'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('72 Hours')
                    .setDescription('Requires 4 Checkpoint steps')
                    .setValue('72_4')
            );

        const row = new ActionRowBuilder().addComponents(durationSelect);

        // Client-side reply (ephemeral)
        await interaction.reply({
            content: '🔑 **Select your desired key duration below:**',
            components: [row],
            ephemeral: true 
        });
    }

    // Dropdown Item Chosen
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_key_duration') {
        const [hours, requiredSteps] = interaction.values[0].split('_');
        const discordId = interaction.user.id;

        // Save active user progress tracking
        activeProgress.set(discordId, {
            current: 0,
            required: parseInt(requiredSteps),
            hours: parseInt(hours)
        });

        // Generate target link containing Discord User ID
        const targetLink = `${WORKINK_BASE}?custom=${discordId}`;

        await interaction.update({
            content: `⏳ **Selected Duration:** ${hours} Hours (${requiredSteps} Checkpoint${requiredSteps > 1 ? 's' : ''})\n\n👉 **Checkpoint 1/${requiredSteps}:**\n${targetLink}\n\n*Complete the link above to advance your progress!*`,
            components: [],
            ephemeral: true
        });
    }
});

// -------------------------------------------------------------
// 2. REDIRECT / CLAIM KEY ENDPOINT
// -------------------------------------------------------------
app.get('/claim-key', (req, res) => {
    // Collect discord user ID from query parameters
    const discordId = req.query.custom || req.query.subid || req.query.user || req.query.token;

    if (!discordId) {
        return res.status(400).send(`
            <div style="font-family: Arial, sans-serif; text-align: center; margin-top: 50px;">
                <h2 style="color: #ff4757;">⚠️ Missing User ID Tag</h2>
                <p>Please open the link directly from your Discord /getkey command interaction.</p>
            </div>
        `);
    }

    const progress = activeProgress.get(discordId) || { current: 0, required: 1, hours: 12 };
    progress.current += 1;

    client.users.fetch(discordId).then(user => {
        // If checkpoints remain
        if (progress.current < progress.required) {
            activeProgress.set(discordId, progress);
            const targetLink = `${WORKINK_BASE}?custom=${discordId}`;

            user.send(`✅ **Checkpoint ${progress.current}/${progress.required} Completed!**\n\n👉 **Next Checkpoint (${progress.current + 1}/${progress.required}):**\n${targetLink}`);
        } else {
            // All checkpoints complete -> create final key
            activeProgress.delete(discordId);

            const randomHash = crypto.randomBytes(11).toString('hex') + crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
            const formattedKey = `LVH_Key=${randomHash}`;
            const expiresAt = Date.now() + (progress.hours * 60 * 60 * 1000);

            activeKeys.set(formattedKey, { discordId, expiresAt });

            user.send(`🎉 **All Checkpoints Cleared!** Here is your **${progress.hours}-Hour** key:\n\`\`\`text\n${formattedKey}\n\`\`\``);
        }
    }).catch(err => console.error(`Failed to DM user ${discordId}:`, err));

    res.send(`
        <div style="font-family: Arial, sans-serif; text-align: center; margin-top: 60px;">
            <h1 style="color: #2ed573;">✅ Checkpoint Processed!</h1>
            <p style="font-size: 18px; color: #57606f;">Check your Discord Direct Messages for your update/key.</p>
        </div>
    `);
});

// -------------------------------------------------------------
// 3. ROBLOX SCRIPT VALIDATION ENDPOINT
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
// 4. SERVER INITIALIZATION
// -------------------------------------------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

client.login(process.env.DISCORD_TOKEN);
