import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({
    region: process.env.AWS_REGION || "ap-southeast-2",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

export async function uploadToS3(file, fileName, contentType = "image/jpeg") {
    const bucketName = process.env.AWS_S3_BUCKET;
    const region = process.env.AWS_REGION || "ap-southeast-2";

    if (!bucketName) {
        throw new Error("AWS_S3_BUCKET is not defined in environment variables");
    }

    let body = file;
    if (typeof file === "string") {
        if (file.startsWith("data:")) {
            const parts = file.split(";base64,");
            contentType = parts[0].replace("data:", "") || contentType;
            body = Buffer.from(parts[1], "base64");
        } else {
            body = Buffer.from(file, "base64");
        }
    }

    if (typeof Blob !== "undefined" && file instanceof Blob) {
        const arrayBuffer = await file.arrayBuffer();
        body = Buffer.from(arrayBuffer);
        contentType = file.type || contentType;
    }

    const uploadParams = {
        Bucket: bucketName,
        Key: fileName,
        Body: body,
        ContentType: contentType,
    };

    const command = new PutObjectCommand(uploadParams);
    await s3Client.send(command);

    const url = `https://${bucketName}.s3.${region}.amazonaws.com/${fileName}`;

    return {
        url,
        key: fileName,
    };
}

export default uploadToS3;