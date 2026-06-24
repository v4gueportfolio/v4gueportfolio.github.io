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
    ButtonStyle          
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
        .setDescription('Generate a clean video download button for an Instagram link!')
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
    if (!interaction.isChatInputCommand()) return;
    const settings = loadSettings();
    const guildId = interaction.guildId;

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

    // === VXINSTAGRAM REAL DYNAMIC SCRAPER DOWNLOAD SYSTEM ===
    if (interaction.commandName === 'ig') {
        const reelUrl = interaction.options.getString('link');
        
        // Let the user know the bot is cooking behind the scenes
        await interaction.deferReply();

        // Convert link to vxinstagram API json output endpoint
        const jsonApiEndpoint = reelUrl
            .replace('instagram.com', 'vxinstagram.com')
            .replace('www.', '');

        try {
            // Pull raw video structural metadata straight from vxinstagram's wrapper API
            const apiMetadata = await axios.get(jsonApiEndpoint, {
                headers: { 'User-Agent': 'TelegramBot (like TwitterBot)' }
            });

            // Extract the deep, long source asset link from the page context headers
            const rawSourceMatch = apiMetadata.data.match(/<meta property="og:video" content="([^"]+)"/);
            
            if (!rawSourceMatch || !rawSourceMatch[1]) {
                return await interaction.editReply({ 
                    content: '❌ **Scraper Error:** API returned an invalid response block or the post is private.' 
                });
            }

            // Unescape HTML entity strings out of the token payload safely
            let finalDownloadLink = rawSourceMatch[1].replace(/&amp;/g, '&');

            // Force browser to save file by ensuring downloader parameter flags are appended
            if (!finalDownloadLink.includes('dl=1')) {
                finalDownloadLink += finalDownloadLink.includes('?') ? '&dl=1' : '?dl=1';
            }

            const mediaButtonRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('📥 Auto-Download Video File')
                    .setStyle(ButtonStyle.Link)
                    .setURL(finalDownloadLink)
            );

            return await interaction.editReply({ 
                content: '🎬 **Your download token has been generated successfully:**',
                components: [mediaButtonRow] 
            });

        } catch (err) {
            console.error('API Pull crashed:', err.message);
            return await interaction.editReply({ 
                content: '❌ **Pipeline Failure:** Video file could not be pulled from vxinstagram nodes.' 
            });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
