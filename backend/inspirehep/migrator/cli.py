# -*- coding: utf-8 -*-
#
# Copyright (C) 2019 CERN.
#
# inspirehep is free software; you can redistribute it and/or modify it under
# the terms of the MIT License; see LICENSE file for more details.

"""Manage migrator from INSPIRE legacy instance."""
import os
import sys
from textwrap import dedent
from time import sleep

import click
from flask import current_app
from flask.cli import with_appcontext

from inspirehep.migrator.api import continuous_migration
from inspirehep.migrator.utils import GracefulKiller

from .tasks import (
    migrate_from_mirror,
    migrate_from_mirror_run_step,
    migrate_record_from_legacy,
    populate_mirror_from_file,
    wait_for_all_tasks,
)


def halt_if_debug_mode(force):
    message = """\
    The application is running in debug mode, which leaks memory when doing
    many database operations. To avoid problems, disable debug mode. This can
    be done by setting "DEBUG=False" in the config or setting the environment
    variable "APP_DEBUG=False". If you know what you are doing, you can pass
    the "--force" flag to disable this check.
    """
    if not force and current_app.config.get("DEBUG"):
        click.echo(dedent(message), err=True)
        sys.exit(1)


def touch_file(file):
    """Updates file last modification time, creates file if it not exists."""
    try:
        os.utime(file)
    except FileNotFoundError:
        open(file, "w").close()


@click.group()
def migrate():
    """Commands to migrate records from legacy."""


@migrate.command("file")
@click.argument(
    "file_name", type=click.Path(exists=True, dir_okay=False, resolve_path=True)
)
@click.option(
    "--mirror-only",
    "-m",
    is_flag=True,
    default=False,
    help="Only mirror the records instead of doing a full migration.",
)
@click.option(
    "-f",
    "--force",
    is_flag=True,
    default=False,
    help="Force the task to run even in debug mode.",
)
@click.option(
    "-w",
    "--wait",
    is_flag=True,
    default=False,
    help="Wait for migration to complete. This only has an effect if the -m flag is not set.",
)
@with_appcontext
def migrate_file(file_name, mirror_only=False, force=False, wait=False):
    """Migrate the records in the provided file.

    The file can be an (optionally-gzipped) XML file containing MARCXML, or a
    prodsync tarball.
    """
    halt_if_debug_mode(force=force)
    click.echo(f"Migrating records from file: {file_name}")

    populate_mirror_from_file(file_name)
    if not mirror_only:
        task = migrate_from_mirror()
        if wait:
            wait_for_all_tasks(task)


@migrate.command()
@click.option(
    "--all",
    "-a",
    "also_migrate",
    flag_value="all",
    help="Migrate all records, irrespective of their status.",
)
@click.option(
    "--broken",
    "-b",
    "also_migrate",
    flag_value="broken",
    help="Also migrate broken records, which did not migrate correctly in the previous run.",
)
@click.option(
    "-f",
    "--force",
    is_flag=True,
    default=False,
    help="Force the task to run even in debug mode.",
)
@click.option(
    "-w", "--wait", is_flag=True, default=False, help="Wait for all subtasks to finish."
)
@click.option(
    "-d",
    "--date-from",
    "date_from",
    default=None,
    help="Date from which records should be migrated. (YYYY-MM-DD)",
)
@with_appcontext
def mirror(also_migrate=None, force=False, wait=False, date_from=None):
    """Migrate records from the mirror.

    By default, only records that have not been migrated yet are migrated.
    """
    halt_if_debug_mode(force=force)
    task = migrate_from_mirror(
        also_migrate=also_migrate, disable_external_push=True, date_from=date_from
    )
    if wait:
        wait_for_all_tasks(task)


@migrate.command()
@click.argument("recid", type=int)
@with_appcontext
def record(recid):
    """Migrate a single record from legacy."""
    click.echo(f"Migrating record {recid} from INSPIRE legacy")
    migrate_record_from_legacy(recid)


@migrate.command()
@with_appcontext
def continuously():
    """Continuously migrate Legacy records."""
    handler = GracefulKiller()

    while not handler.kill_now():
        liveness_file = current_app.config.get("MIGRATION_LASTRUN_FILE")
        if liveness_file:
            touch_file(liveness_file)
        continuous_migration()
        sleep(current_app.config.get("MIGRATION_POLLING_SLEEP", 1))


@migrate.command()
@click.option(
    "-f",
    "--force",
    is_flag=True,
    default=False,
    help="Force the task to run even in debug mode.",
)
@click.option(
    "-w", "--wait", is_flag=True, default=False, help="Wait for all subtasks to finish."
)
@click.option(
    "-s",
    "--step",
    default=0,
    type=int,
    help="""
    1 - Migrate from mirror table
    2 - Recalculate citations proceedings etc.
    3 - Reindex
    """,
)
@with_appcontext
def mirror_step(force=False, wait=False, step=0):
    """Migrate records step by step

    (Re)Migrates only records marked as valid
    """
    halt_if_debug_mode(force=force)
    task = migrate_from_mirror_run_step(step_no=step - 1)
    if wait:
        wait_for_all_tasks(task)
