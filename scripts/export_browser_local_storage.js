/*
 * Phase 0 browser export helper.
 *
 * Run this file's IIFE in the browser developer console while ChessForge is
 * open on the origin that contains the user's data. It reads but does not
 * change localStorage, then downloads a timestamped JSON export.
 */
(() => {
    const knownKeys = [
        'chess_current_sort',
        'chessSkillLevel',
        'chess_profile_username',
        'chess_profile_avatar_piece',
        'chess_profile_avatar_theme',
        'chess_saved_games',
        'chess_saved_games_pending',
        'chess_account_profiles',
        'chess_active_profile_username',
        'chess_account_profiles_migrated_from_global',
        'chess_com_username',
        'chess_com_last_sync_at',
        'training_player_profile',
        'training_total_xp',
        'training_current_streak',
        'training_weakness_profile',
        'chess_recent_activity',
        'play_computer_stockfish_elo'
    ];
    const values = {};
    const discoveredKeys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
        .filter(Boolean)
        .sort();
    for (const key of [...new Set([...knownKeys, ...discoveredKeys])]) {
        const value = localStorage.getItem(key);
        if (value !== null) values[key] = value;
    }
    const exportRecord = {
        schema: 'chessforge-browser-storage-export-v1',
        exportedAt: new Date().toISOString(),
        origin: window.location.origin,
        keys: Object.keys(values).sort(),
        values
    };
    const blob = new Blob([`${JSON.stringify(exportRecord, null, 2)}\n`], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `chessforge-browser-storage-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    console.info(`[Phase0] Exported ${exportRecord.keys.length} localStorage key(s) without modifying browser data.`);
})();
