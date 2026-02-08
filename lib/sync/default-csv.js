const DEFAULT_PROFILES_CSV = `line_user_id,display_name,language_pref,interest_tags,location,career_goal,updated_at
U1001,Yuki,ja,"audition|school|tokyo",Tokyo,voice actor,2026-02-01T00:00:00Z
U1002,Emma,en,"job|acting|online",Los Angeles,on-camera role,2026-02-01T00:00:00Z
U1003,Ren,ja,"job|commercial|osaka",Osaka,commercial talent,2026-02-01T00:00:00Z
`;

const DEFAULT_KNOWLEDGE_CSV = `item_id,category,title,summary,eligibility,location,deadline_iso,url,tags,priority
K001,audition,Tokyo Voice Audition 2026,Anime voice role shortlist,JP work permit required,Tokyo,2026-04-30,https://example.com/audition/tokyo-voice,"audition|tokyo|voice",3
K002,job,Remote Creator School Scholarship,Online training for creators,Beginner-friendly,Online,2026-05-20,https://example.com/school/creator-scholarship,"school|online|training",2
K003,job,Osaka Commercial Casting Call,Brand commercial shooting,Prior camera experience preferred,Osaka,2026-03-25,https://example.com/job/osaka-commercial,"job|commercial|osaka",2
K004,school,LA Weekend Acting Workshop,Short intensive acting workshop,English communication required,Los Angeles,2026-03-10,https://example.com/school/la-weekend,"school|acting|losangeles",1
`;

module.exports = {
  DEFAULT_PROFILES_CSV,
  DEFAULT_KNOWLEDGE_CSV,
};
