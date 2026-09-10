import axios from "axios";

export class EC2Service {
  static async getInstanceStatus(instanceId) {
    const response = await axios.get("/api/ec2/instance", {
      params: instanceId ? { instanceId } : undefined,
    });
    return response.data;
  }

  static async getFleetStatus() {
    const response = await axios.get("/api/ec2/instance", {
      params: { mode: "fleet" },
    });
    return response.data;
  }

  static async startInstance(instanceId) {
    const response = await axios.post("/api/ec2/instance", {
      action: "start",
      instanceId,
    });
    return response.data;
  }

  static async startAllInstances(instanceIds) {
    const response = await axios.post("/api/ec2/instance", {
      action: "start_all",
      instanceIds,
    });
    return response.data;
  }

  static async stopInstance(instanceId) {
    const response = await axios.post("/api/ec2/instance", {
      action: "stop",
      instanceId,
    });
    return response.data;
  }

  static async stopAllInstances(instanceIds) {
    const response = await axios.post("/api/ec2/instance", {
      action: "stop_all",
      instanceIds,
    });
    return response.data;
  }

  static async rebootInstance(instanceId) {
    const response = await axios.post("/api/ec2/instance", {
      action: "reboot",
      instanceId,
    });
    return response.data;
  }
}

export default EC2Service;

