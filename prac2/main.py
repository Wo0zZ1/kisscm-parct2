import subprocess
import json
from typing import Any

from graphviz import Digraph


def get_pipdeptree_output():
    result = subprocess.run(["pipdeptree", "--json"], capture_output=True)
    return json.loads(result.stdout)


def create_dependency_graph(dependencies):
    dot = Digraph(format="png")

    def add_nodes_edges(dep: dict[str, Any], parent: str | None = None) -> None:
        data = dep.get("package", dep)
        package_name = data["package_name"]
        package_version = data["installed_version"]

        node_label = f"{package_name}\n{package_version}"
        dot.node(package_name, node_label)

        if parent:
            dot.edge(parent, package_name)

        for sub_dep in dep.get("dependencies", []):
            add_nodes_edges(sub_dep, package_name)

    for dependency in dependencies:
        add_nodes_edges(dependency)

    dot.render("dependencies", view=False)


def main() -> None:
    dependencies = get_pipdeptree_output()
    create_dependency_graph(dependencies)


if __name__ == "__main__":
    main()
