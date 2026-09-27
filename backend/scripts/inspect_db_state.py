import asyncio
import logging
logging.getLogger('sqlalchemy.engine').setLevel(logging.WARNING)

from app.core.database import AsyncSessionLocal
from app.models.tournament import Tournament
from app.models.tournament_registration import TournamentRegistration
from app.models.competition import Match, Team
from app.models.league import League
from app.services.competition_service import CompetitionService
from sqlalchemy import select

async def main():
    async with AsyncSessionLocal() as session:
        ts = (await session.execute(select(Tournament))).scalars().all()
        print(f"=== TOURNAMENTS ({len(ts)}) ===")
        for t in ts:
            teams = (await session.execute(select(Team).where(Team.tournament_id == t.id))).scalars().all()
            matches = (await session.execute(select(Match).where(Match.tournament_id == t.id))).scalars().all()
            regs = (await session.execute(select(TournamentRegistration).where(TournamentRegistration.tournament_id == t.id))).scalars().all()
            print(f"- \"{t.name}\" ({t.id}): format={t.format.value}, status={t.status.value}, teams={len(teams)}, regs={len(regs)}, matches={len(matches)}")
            if len(matches) > 0:
                for m in sorted(matches, key=lambda x: x.match_number or 0):
                    print(f"    Match #{m.match_number}: R{m.bracket_round}P{m.bracket_position} team_a={m.team_a_id} team_b={m.team_b_id} score={m.score_a}-{m.score_b} winner={m.winner_team_id} status={m.status.value} next_match_id={m.next_match_id} next_match_slot={m.next_match_slot}")
            try:
                st = await CompetitionService(session).get_standings(t.club_id, t.id)
                print(f"    Standings rows count: {len(st.standings)}")
                for r in st.standings:
                    print(f"      {r.rank}. {r.team_name} (W:{r.wins} L:{r.losses} Diff:{r.points_differential}) status={r.status}")
            except Exception as e:
                print(f"    Standings error: {e}")

        leagues = (await session.execute(select(League))).scalars().all()
        print(f"\n=== LEAGUES ({len(leagues)}) ===")
        for l in leagues:
            teams = (await session.execute(select(Team).where(Team.league_id == l.id))).scalars().all()
            print(f"- \"{l.name}\" ({l.id}): status={l.status.value}, teams={len(teams)}")

if __name__ == "__main__":
    asyncio.run(main())
