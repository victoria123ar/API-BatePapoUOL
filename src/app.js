const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const joi = require("joi");
const dayjs = require("dayjs");
const mongoose = require("mongoose");

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

const port = 5000;

let participantesArray = joi.object({ name: joi.string().required().min(3) });
let mensagensArray = joi.object({
  from: joi.string().required(),
  to: joi.string().required().min(3),
  text: joi.string().required().min(1),
  type: joi.string().required().valid("message", "private_message"),
  time: joi.string(),
});

const url = process.env.DATABASE_URL;
mongoose.set("strictQuery", false);
mongoose.connect(url, { useNewUrlParser: true });

const db = mongoose.connection;
db.once("open", () => {
  console.log("Database conectada:", url);
});

db.on("error", (err) => {
  console.error("Erro ao conectar na Database:", err);
});

const participantsCollection = db.collection("participants");
const messagesCollection = db.collection("messages");

app.post("/participants", async (req, res) => {
  const { name } = req.body;
  const { error } = participantesArray.validate(
    { name },
    { abortEarly: false }
  );

  if (error) {
    const errors = error.details.map((detail) => detail.message);
    return res.status(422).send(errors);
  }

  try {
    const participanteExistente = await participantsCollection.findOne({
      name,
    });
    if (participanteExistente) 
    {
      return res.sendStatus(409);
    }

    await participantsCollection.insertOne({ name, lastStatus: Date.now() });

    await messagesCollection.insertOne({
      from: name,
      to: "Todos",
      text: "entra na sala...",
      type: "status",
      time: dayjs().format("HH:mm:ss"),
    });

    res.sendStatus(201);
  } catch (err) {
    console.log(err);
    res.sendStatus(500);
  }
});

app.get("/participants", async (req, res) => {
  try {
    const participantes = await participantsCollection.find().toArray();
    if (!participantes) {
      return res.sendStatus(404);
    }

    res.send(participantes);
  } catch (err) {
    console.log(err);
    res.sendStatus(500);
  }
});

app.post("/messages", async (req, res) => {
  const { to, text, type } = req.body;
  const { user } = req.headers;
  const mensagem = {
    from: user,
    to,
    text,
    type,
    time: dayjs().format("HH:mm:ss"),
  };

  try {
    const { error } = mensagensArray.validate(mensagem, { abortEarly: false });

    if (error) {
      const errors = error.details.map((detail) => detail.message);
      return res.status(422).send(errors);
    }

    const QtdDocuments = await participantsCollection.countDocuments({ name: user });
    if(QtdDocuments == 0)
    {
      res.sendStatus(422);
    }

    await messagesCollection.insertOne(mensagem);

    res.sendStatus(201);
  } catch (err) {
    console.log(err);
    res.sendStatus(500);
  }
});

app.get("/messages", async (req, res) => {
  try {
    const { user } = req.headers;

    let mensagens;
    let existeLimite = true;

    if(!req.query.limit)
    {
      existeLimite = false
    }

    const limit = Number(req.query.limit);

    if(limit <= 0 || typeof limit == "string" )
    {
      return res.sendStatus(422)
    }

    if(existeLimite)
    {
      mensagens = await messagesCollection
      .find({
        $or: [
          { to: "Todos" },
          { to: user },
          { from: user },
        ]
      }) 
      .limit(limit)
      .toArray();
    }
    else
    {
      mensagens = await messagesCollection
      .find({
        $or: [
          { to: "Todos" },
          { to: user },
          { from: user },
        ]
      })
      .toArray();
    }

    if (mensagens.length === 0) 
    {
      return res.status(404).send("Nenhuma mensagem encontrada");
    }

    let retorno = []
    mensagens.forEach(el =>
    {
      retorno.push({ to: el.to, text: el.text, type: el.type, from: el.from })
    });

     //retorno.forEach(el =>{console.log(el)});

    return res.status(200).send(JSON.stringify(retorno));
    
  } catch (err) 
  {
    console.log(err);
    return res.sendStatus(500);
  }

});

app.post("/status", async (req, res) => {
  const { user } = req.headers;

  try {
    const participanteExistente = await participantsCollection.findOne({
      name: user,
    });

    if (!participanteExistente) {
      return res.sendStatus(404);
    }

    await participantsCollection.updateOne(
      { name: user },
      { $set: { lastStatus: Date.now() } }
    );

    res.sendStatus(200);
  } catch (err) {
    console.log(err);
    res.sendStatus(500);
  }
});

setInterval(async () => {
  const segundos = Date.now() - 10000;

  try {
    const participanteInativo = await participantsCollection
      .find({ lastStatus: { $lte: segundos } })
      .toArray();

    if (participanteInativo.length > 0) {
      const inatividade = participanteInativo.map((participante) => {
        return {
          from: participante.name,
          to: "Todos",
          text: "sai da sala...",
          type: "status",
          time: dayjs().format("HH:mm:ss"),
        };
      });

      await messagesCollection.insertMany(inatividade);
      await participantsCollection.deleteMany({
        lastStatus: { $lte: segundos },
      });
    }
  } catch (err) {
    console.log(err);
    res.sendStatus(500);
  }
}, 15000);

app.listen(port, () => console.log(`Servidor está rodando na porta ${port}`));
