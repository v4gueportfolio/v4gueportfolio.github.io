const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { 
    Client, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    EmbedBuilder, 
    PermissionFlagsBits, 
    ChannelType,
    ActionRowBuilder,    
    ButtonBuilder,       
    ButtonStyle,
    AttachmentBuilder    // Added to upload files directly into chat rows
} = require('discord.js');

const app = report => express();
const appInstance = express();
const PORT = process.env.PORT || 3000;

// === KEEPING YOUR ORIGINAL OAUTH2 CODE ===
appInstance.get('/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send('No code provided');
    try {
        const response = await axios.post('https://discord.com/api/v10/oauth2/token', new URLSearchParams({
            client_id: '1512761665719111892', 
            client_secret: process.env.DISCORD_SECRET, 
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: 'https://v4gueportfolio-github-io.onrender.com/callback'
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        res.send('Bot authorized successfully! You can close this tab now.');
    } catch (error) {
        console.error(error.response?.data || error.message);
        res.status(500).send('OAuth2 Exchange Failed');
    }
});

appInstance.listen(PORT, () => console.log(`Web server blasting on port ${PORT}`));


// === BOT ENGINE WITH FIXED COMMAND BUILDER ===
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildPresences
    ]
}); 

const DATA_FILE = path.join(__dirname, 'server_settings.json');

function loadSettings() {
    if (!fs.existsSync(DATA_FILE)) return {};
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
        return {};
    }
}

function saveSettings(settings) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(settings, null, 2));
}

const commands = [
    new SlashCommandBuilder()
        .setName('createevent')
        .setDescription('Create a new event!')
        .addStringOption(option => option.setName('title').setDescription('Event title').setRequired(true))
        .addStringOption(option => option.setName('link').setDescription('Event link (Kahoot, Roblox, etc.)').setRequired(true))
        .addNumberOption(option => option.setName('duration').setDescription('Time value').setRequired(true))
        .addStringOption(option => 
            option.setName('unit')
                .setDescription('Time unit')
                .setRequired(true)
                .addChoices(
                    { name: 'Minutes', value: 'm' },
                    { name: 'Hours', value: 'h' },
                    { name: 'Days', value: 'd' }
                )
        )
        .addNumberOption(option => option.setName('robux').setDescription('Robux prize amount').setRequired(true))
        .addStringOption(option => option.setName('desc').setDescription('Event description').setRequired(false)),

    new SlashCommandBuilder()
        .setName('eventchannel')
        .setDescription('Set the target channel for your hosted events.')
        .addChannelOption(option => option.setName('target').setDescription('Select the target chat channel').setRequired(true).addChannelTypes(ChannelType.GuildText))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('eventrole')
        .setDescription('Set the required role to use the event host command.')
        .addRoleOption(option => option.setName('role').setDescription('Select the host permission role').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('proofchannel')
        .setDescription('Set the target channel where event proof is posted.')
        .addChannelOption(option => option.setName('target').setDescription('Select the target proof channel').setRequired(true).addChannelTypes(ChannelType.GuildText))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('createproof')
        .setDescription('Submit proof for an event.')
        .addStringOption(option => option.setName('title').setDescription('The title of the event/proof').setRequired(true))
        .addAttachmentOption(option => option.setName('image').setDescription('Upload proof image').setRequired(true)),

    new SlashCommandBuilder()
        .setName('ig')
        .setDescription('Generate an interactive direct file download button for an Instagram link!')
        .addStringOption(option => option.setName('link').setDescription('Paste the Instagram reel URL').setRequired(true))
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`Boom! ${client.user.tag} is officially ONLINE! 🥀`);
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands('1512761665719111892'), { body: commands });
        console.log('Commands successfully registered!');
    } catch (error) {
        console.error(error);
    }

    // === AUTOMATED SERVER STATS COUNTER ===
    const TOTAL_MEMBERS_CH_ID = '1512730703715106836';
    const BOTS_CH_ID = '1512731743696977960';
    
    let lastUpdated = 0;
    const COOLDOWN_MS = 6 * 60 * 1000; 

    async function updateServerStats() {
        const now = Date.now();
        if (now - lastUpdated < COOLDOWN_MS) {
            console.log('Stats update blocked: Cooldown active, cooling down... ⏳');
            return;
        }

        try {
            for (const [guildId, guild] of client.guilds.cache) {
                const totalCh = await guild.channels.fetch(TOTAL_MEMBERS_CH_ID).catch(() => null);
                const botsCh = await guild.channels.fetch(BOTS_CH_ID).catch(() => null);

                if (!totalCh && !botsCh) continue;

                await guild.members.fetch().catch(() => null);
                const totalBots = guild.members.cache.filter(m => m.user.bot).size;
                const realHumans = guild.memberCount - totalBots;

                if (totalCh && totalCh.name !== `Members: ${realHumans}`) {
                    await totalCh.setName(`Members: ${realHumans}`).catch(() => null);
                }
                if (botsCh && botsCh.name !== `Bots: ${totalBots}`) {
                    await botsCh.setName(`Bots: ${totalBots}`).catch(() => null);
                }
            }
            lastUpdated = Date.now();
            console.log('Server stats checked and safely updated inside the 6m window!');
        } catch (err) {
            console.error('Stats loop hit a wall:', err);
        }
    }

    updateServerStats();

    client.on('guildMemberAdd', () => updateServerStats());
    client.on('guildMemberRemove', () => updateServerStats());
});

client.on('interactionCreate', async interaction => {
    const settings = loadSettings();
    const guildId = interaction.guildId;

    // === DIRECT NATIVE FILE DOWNLOAD ACTION COLLECTOR ===
    if (interaction.isButton() && interaction.customId.startsWith('dl_ig_')) {
        await interaction.deferReply({ ephemeral: true });
        
        // Isolate the base64 encoded URL parameters passing through the customID key
        const encryptedLink = interaction.customId.replace('dl_ig_', '');
        const targetReelUrl = Buffer.from(encryptedLink, 'base64').toString('utf-8');

        try {
            const proxyTarget = targetReelUrl
                .replace('instagram.com', 'vxinstagram.com')
                .replace('www.', '');

            const pageRes = await axios.get(proxyTarget, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Discordbot/2.0' },
                timeout: 8000
            });

            const streamMatch = pageRes.data.match(/<meta\s+property=["']og:video["']\s+content=["']([^"']+)["']/i) || 
                                pageRes.data.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:video["']/i);

            const verifiedVideoUrl = streamMatch ? streamMatch[1] : null;

            if (!verifiedVideoUrl) {
                return await interaction.editReply({ content: '❌ **Extraction Failed!** The stream engine timed out. Try again shortly.' });
            }

            const videoBuffer = await axios.get(verifiedVideoUrl, { responseType: 'arraybuffer', timeout: 12000 });
            const fileAttachment = new AttachmentBuilder(Buffer.from(videoBuffer.data), { name: 'instagram_reel.mp4' });

            return await interaction.editReply({ content: '🎬 **Here is your file, Shafir!** Done completely inside Discord:', files: [fileAttachment] });

        } catch (err) {
            console.error(err);
            return await interaction.editReply({ content: '❌ **Upload Failure:** Video file exceeded Discord server size limits.' });
        }
    }

    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'eventchannel') {
        const targetChannel = interaction.options.getChannel('target');
        if (!settings[guildId]) settings[guildId] = {};
        settings[guildId].channelId = targetChannel.id;
        saveSettings(settings);
        return await interaction.reply({ content: `✨ **Success!** Event destination set to: <#${targetChannel.id}>`, ephemeral: true });
    }

    if (interaction.commandName === 'eventrole') {
        const targetRole = interaction.options.getRole('role');
        if (!settings[guildId]) settings[guildId] = {};
        settings[guildId].roleId = targetRole.id;
        saveSettings(settings);
        return await interaction.reply({ content: `🛡️ **Success!** Only users with <@&${targetRole.id}> can now host events.`, ephemeral: true });
    }

    if (interaction.commandName === 'proofchannel') {
        const targetChannel = interaction.options.getChannel('target');
        if (!settings[guildId]) settings[guildId] = {};
        settings[guildId].proofChannelId = targetChannel.id;
        saveSettings(settings);
        return await interaction.reply({ content: `📸 **Success!** Proof destination set to: <#${targetChannel.id}>`, ephemeral: true });
    }

    if (interaction.commandName === 'createproof') {
        const title = interaction.options.getString('title');
        const imageFile = interaction.options.getAttachment('image');
        const proofChannelId = settings[guildId]?.proofChannelId;

        if (!proofChannelId) {
            return await interaction.reply({ content: `❌ **Failed!** An administrator needs to configure a \`/proofchannel\` first!`, ephemeral: true });
        }

        const proofChannel = interaction.guild.channels.cache.get(proofChannelId);
        if (!proofChannel) {
            return await interaction.reply({ content: `❌ **Failed!** Configured proof channel was not found.`, ephemeral: true });
        }

        const submitterName = interaction.member.nickname || interaction.member.displayName || interaction.user.username;
        const submitterMention = `@${interaction.user.username}`;

        const proofEmbed = new EmbedBuilder()
            .setColor(0x00FFFF)
            .setTitle(`Proof of ${title}`)
            .setDescription(`**By ${submitterName} (${submitterMention})**`)
            .setImage(imageFile.url)
            .setTimestamp();

        try {
            await proofChannel.send({ embeds: [proofEmbed] });
            return await interaction.reply({ content: `🚀 **Boom!** Proof successfully submitted to <#${proofChannelId}>!`, ephemeral: true });
        } catch (err) {
            console.error(err);
            return await interaction.reply({ content: `❌ **Error:** Failed sending proof packet to the logs.`, ephemeral: true });
        }
    }

    if (interaction.commandName === 'createevent') {
        const title = interaction.options.getString('title');
        let link = interaction.options.getString('link');
        const duration = interaction.options.getNumber('duration');
        const unit = interaction.options.getString('unit');
        const robux = interaction.options.getNumber('robux');
        const desc = interaction.options.getString('desc') || 'No description provided.';

        if (!link.startsWith('http://') && !link.startsWith('https://')) {
            link = 'https://' + link;
        }

        const hostMention = `@${interaction.user.username}`;
        let msToAdd = 0;
        if (unit === 'm') msToAdd = duration * 60 * 1000;
        if (unit === 'h') msToAdd = duration * 60 * 60 * 1000;
        if (unit === 'd') msToAdd = duration * 24 * 60 * 60 * 1000;

        const futureUnixTimestamp = Math.floor((Date.now() + msToAdd) / 1000);
        const relativeTimeTag = `<t:${futureUnixTimestamp}:R>`;

        let postedCount = 0;
        let missingRoleServers = 0;

        for (const [id, guild] of client.guilds.cache) {
            const guildSettings = settings[id];
            const targetChannelId = guildSettings?.channelId;
            const requiredRoleId = guildSettings?.roleId;

            if (!targetChannelId) continue; 

            try {
                const member = await guild.members.fetch(interaction.user.id).catch(() => null);
                if (!member) continue; 

                if (requiredRoleId && !member.roles.cache.has(requiredRoleId)) {
                    missingRoleServers++;
                    continue; 
                }

                const hostServerName = member.nickname || member.displayName || interaction.user.username;
                const targetChannel = guild.channels.cache.get(targetChannelId);

                if (targetChannel) {
                    const eventEmbed = new EmbedBuilder()
                        .setColor(0x00FF00)
                        .setTitle(`${title} - ${robux} R$`)
                        .setDescription(`**By ${hostServerName} (${hostMention})**\n\n${desc}`)
                        .addFields(
                            { name: '⏳ Starting in', value: relativeTimeTag, inline: false },
                            { name: '🔗 Event Link', value: link, inline: false }
                        )
                        .setTimestamp();

                    const rolePingText = `|| <@&1512735552426741910> ||`;
                    await targetChannel.send({ embeds: [eventEmbed], content: rolePingText });
                    postedCount++;
                }
            } catch (err) {
                console.error(`Error processing server loop for guild ${id}:`, err);
            }
        }

        if (postedCount === 0) {
            let errorMsg = `❌ **Could not post event anywhere.**`;
            if (missingRoleServers > 0) {
                errorMsg += ` You lack the required permission roles configured on the target servers!`;
            } else {
                errorMsg += ` Make sure the destination servers have set up an \`/eventchannel\` first.`;
            }
            return await interaction.reply({ content: errorMsg, ephemeral: true });
        }

        await interaction.reply({ content: `🚀 **Blast Off!** Event successfully beamed to **${postedCount}** verified server channel(s)!`, ephemeral: true });
    }

    // === GENERATE THE DIRECT FILE INTERACTION BUTTON ===
    if (interaction.commandName === 'ig') {
        const reelUrl = interaction.options.getString('link');
        
        // Package link cleanly using base64 routing blocks inside the customId constraint limits
        const encodedUrlId = Buffer.from(reelUrl).toString('base64');

        const downloadButtonRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`dl_ig_${encodedUrlId}`)
                .setLabel('📥 Download Video File Directly')
                .setStyle(ButtonStyle.Primary) // Regular interaction execution button layout
        );

        return await interaction.reply({ 
            content: '💬 **Click the button below to process and pull the video file directly into this chat chatroom:**',
            components: [downloadButtonRow]
        });
    }
});

client.login(process.env.DISCORD_TOKEN);
